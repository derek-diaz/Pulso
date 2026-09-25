package main

import (
	"bytes"
	"debug/pe"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Minimal real PE files exercise descriptor parsing as well as dependency
// resolution, without requiring a Windows compiler on the test host.
func writePE(t *testing.T, path string, machine uint16, imports []string, delay bool) {
	t.Helper()
	const rva, offset = 0x1000, 0x200
	descriptorSize, nameOffset, tableIndex := 20, 12, 1
	if delay {
		descriptorSize, nameOffset, tableIndex = 32, 4, 13
	}
	data := make([]byte, (len(imports)+1)*descriptorSize)
	for i, name := range imports {
		if delay {
			binary.LittleEndian.PutUint32(data[i*descriptorSize:], 1)
		}
		binary.LittleEndian.PutUint32(data[i*descriptorSize+nameOffset:], uint32(rva+len(data)))
		data = append(data, append([]byte(name), 0)...)
	}
	header := pe.OptionalHeader64{Magic: 0x20b, NumberOfRvaAndSizes: 16}
	header.DataDirectory[tableIndex] = pe.DataDirectory{VirtualAddress: rva, Size: uint32((len(imports) + 1) * descriptorSize)}
	var buf bytes.Buffer
	dos := make([]byte, 64)
	copy(dos, "MZ")
	binary.LittleEndian.PutUint32(dos[0x3c:], uint32(len(dos)))
	buf.Write(dos)
	buf.WriteString("PE\x00\x00")
	for _, value := range []any{
		pe.FileHeader{Machine: machine, NumberOfSections: 1, SizeOfOptionalHeader: uint16(binary.Size(header))},
		header,
		pe.SectionHeader32{Name: [8]byte{'.', 'i', 'd', 'a', 't', 'a'}, VirtualAddress: rva, VirtualSize: uint32(len(data)), SizeOfRawData: uint32(len(data)), PointerToRawData: offset},
	} {
		if err := binary.Write(&buf, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	buf.Write(make([]byte, offset-buf.Len()))
	buf.Write(data)
	if err := os.WriteFile(path, buf.Bytes(), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestStageAndVerifyTransitiveRuntime(t *testing.T) {
	source, dest := t.TempDir(), t.TempDir()
	exe := filepath.Join(source, "Pulso.exe")
	writePE(t, exe, pe.IMAGE_FILE_MACHINE_AMD64, []string{"KERNEL32.dll", "LIBPLCTAG.dll"}, false)
	writePE(t, filepath.Join(source, "libplctag.dll"), pe.IMAGE_FILE_MACHINE_AMD64, []string{"libgcc_s_seh-1.dll"}, false)
	writePE(t, filepath.Join(source, "libgcc_s_seh-1.dll"), pe.IMAGE_FILE_MACHINE_AMD64, []string{"libwinpthread-1.dll"}, false)
	writePE(t, filepath.Join(source, "libwinpthread-1.dll"), pe.IMAGE_FILE_MACHINE_AMD64, []string{"libgcc_s_seh-1.dll", "api-ms-win-crt-runtime-l1-1-0.dll"}, true)
	if err := os.WriteFile(filepath.Join(dest, "stale.dll"), []byte("old build"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{exe}, nil, dest, "amd64", "", false); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dest)
	if err != nil || len(entries) != 3 {
		t.Fatalf("staged entries = %v, err = %v; want exactly three runtime DLLs", entries, err)
	}
	if err := run([]string{exe}, nil, dest, "amd64", "", true); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dest, "libwinpthread-1.dll")); err != nil {
		t.Fatal(err)
	}
	// Even an explicit developer-toolchain search path must not rescue an
	// incomplete package during verification.
	err = run([]string{exe}, []string{source}, dest, "amd64", "gcc", true)
	if err == nil || !strings.Contains(err.Error(), "libgcc_s_seh-1.dll requires libwinpthread-1.dll") {
		t.Fatalf("missing transitive dependency error = %v", err)
	}
}

func TestMissingOrWrongArchitectureFailsBeforeStaging(t *testing.T) {
	for _, test := range []struct {
		name    string
		machine uint16
		want    string
	}{
		{"missing", 0, "requires libgcc_s_seh-1.dll"},
		{"wrong architecture", pe.IMAGE_FILE_MACHINE_ARM64, "wrong architecture"},
	} {
		t.Run(test.name, func(t *testing.T) {
			source, dest := t.TempDir(), t.TempDir()
			root := filepath.Join(source, "libplctag.dll")
			writePE(t, root, pe.IMAGE_FILE_MACHINE_AMD64, []string{"libgcc_s_seh-1.dll"}, false)
			if test.machine != 0 {
				writePE(t, filepath.Join(source, "libgcc_s_seh-1.dll"), test.machine, nil, false)
			}
			marker := filepath.Join(dest, "previous.dll")
			if err := os.WriteFile(marker, []byte("previous build"), 0644); err != nil {
				t.Fatal(err)
			}
			err := run([]string{root}, nil, dest, "amd64", "", false)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %v; want %q", err, test.want)
			}
			if _, err := os.Stat(marker); err != nil {
				t.Fatalf("failed staging modified previous runtime: %v", err)
			}
		})
	}
}

func TestDoesNotDeleteSourceDLLs(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "libplctag.dll")
	writePE(t, root, pe.IMAGE_FILE_MACHINE_ARM64, nil, false)
	if err := run([]string{root}, nil, dir, "arm64", "", false); err == nil {
		t.Fatal("expected overlapping source/destination rejection")
	}
	if err := run([]string{root}, nil, dir, "arm64", "", true); err != nil {
		t.Fatal(err)
	}
}

func TestRejectsInvalidPEAndImportNames(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "invalid.dll")
	if err := os.WriteFile(path, []byte("not a PE file"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectPE(path); err == nil {
		t.Fatal("expected invalid PE error")
	}
	writePE(t, path, pe.IMAGE_FILE_MACHINE_AMD64, []string{"../outside.dll"}, false)
	if err := run([]string{path}, nil, t.TempDir(), "amd64", "", false); err == nil {
		t.Fatal("expected invalid DLL import error")
	}
}

func TestSystemDLLPolicy(t *testing.T) {
	for _, name := range []string{"KERNEL32.DLL", "ws2_32.dll", "api-ms-win-crt-heap-l1-1-0.dll", "ucrtbase.dll"} {
		if !isSystemDLL(name) {
			t.Errorf("%s should be supplied by Windows", name)
		}
	}
	for _, name := range []string{"libgcc_s_seh-1.dll", "libwinpthread-1.dll", "libstdc++-6.dll", "vcruntime140.dll", "unknown.dll"} {
		if isSystemDLL(name) {
			t.Errorf("%s must be packaged", name)
		}
	}
}
