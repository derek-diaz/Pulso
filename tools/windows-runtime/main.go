// windows-runtime stages and audits the non-system DLL closure of Windows PE files.
// It runs on the build host, including Linux when cross-compiling Pulso.
package main

import (
	"bytes"
	"debug/pe"
	"encoding/binary"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type paths []string

func (p *paths) String() string { return strings.Join(*p, ", ") }
func (p *paths) Set(value string) error {
	*p = append(*p, value)
	return nil
}

func main() {
	var roots, search paths
	flag.Var(&roots, "root", "EXE or DLL to inspect (repeatable)")
	flag.Var(&search, "search", "trusted runtime directory (repeatable, stage only)")
	dest := flag.String("dest", "", "directory containing the packaged runtime DLLs")
	arch := flag.String("arch", "amd64", "target architecture: amd64 or arm64")
	cc := flag.String("cc", "", "target compiler used to locate runtime DLLs (stage only)")
	verify := flag.Bool("verify", false, "audit using only DLLs in dest, without copying")
	flag.Parse()
	if err := run(roots, search, *dest, *arch, *cc, *verify); err != nil {
		fmt.Fprintln(os.Stderr, "Windows runtime:", err)
		os.Exit(1)
	}
}

func run(roots, search []string, dest, arch, cc string, verify bool) error {
	machine := map[string]uint16{"amd64": pe.IMAGE_FILE_MACHINE_AMD64, "arm64": pe.IMAGE_FILE_MACHINE_ARM64}[arch]
	if len(roots) == 0 || dest == "" || machine == 0 {
		return fmt.Errorf("provide -root, -dest and a supported -arch")
	}
	if verify {
		search = []string{dest}
		cc = ""
	} else {
		for _, root := range roots {
			search = append(search, filepath.Dir(root))
		}
	}
	resolve := resolver(search, cc)
	files, err := dependencies(roots, machine, inspectPE, resolve)
	if err != nil {
		return err
	}
	if !verify {
		// Resolve the entire graph before touching the previous staging directory.
		// Remove only staged DLL files, never directories or unrelated resources.
		absoluteDest, err := filepath.Abs(dest)
		if err != nil {
			return err
		}
		for _, file := range files {
			absoluteSource, err := filepath.Abs(filepath.Dir(file))
			if err != nil {
				return err
			}
			if strings.EqualFold(absoluteDest, absoluteSource) {
				return fmt.Errorf("source DLL directory overlaps destination; use -verify to audit in place")
			}
		}
		if err := os.MkdirAll(dest, 0755); err != nil {
			return err
		}
		entries, err := os.ReadDir(dest)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if !entry.IsDir() && strings.EqualFold(filepath.Ext(entry.Name()), ".dll") {
				if err := os.Remove(filepath.Join(dest, entry.Name())); err != nil {
					return err
				}
			}
		}
		for _, file := range files {
			data, err := os.ReadFile(file)
			if err != nil {
				return err
			}
			if err := os.WriteFile(filepath.Join(dest, filepath.Base(file)), data, 0644); err != nil {
				return err
			}
		}
	}
	for _, file := range files {
		fmt.Println(filepath.Base(file))
	}
	fmt.Printf("Verified %s runtime closure (%d DLLs).\n", arch, len(files))
	return nil
}

type peInfo struct {
	machine uint16
	imports []string
}

func inspectPE(path string) (peInfo, error) {
	f, err := pe.Open(path)
	if err != nil {
		return peInfo{}, err
	}
	defer f.Close()
	imports, err := importedDLLs(f)
	return peInfo{f.Machine, imports}, err
}

// debug/pe.ImportedLibraries is unimplemented, and ImportedSymbols omits
// ordinal-only imports. Read DLL names directly from the import descriptors.
func importedDLLs(f *pe.File) ([]string, error) {
	header, ok := f.OptionalHeader.(*pe.OptionalHeader64)
	if !ok {
		return nil, fmt.Errorf("expected a 64-bit PE optional header")
	}
	rvaData := func(rva uint32) ([]byte, error) {
		for _, section := range f.Sections {
			if rva >= section.VirtualAddress && rva-section.VirtualAddress < section.Size {
				data, err := section.Data()
				if err != nil {
					return nil, err
				}
				return data[rva-section.VirtualAddress:], nil
			}
		}
		return nil, fmt.Errorf("import RVA %#x is outside PE sections", rva)
	}
	var imports []string
	for _, table := range []struct{ index, size, nameOffset int }{
		{1, 20, 12}, // IMAGE_IMPORT_DESCRIPTOR
		{13, 32, 4}, // IMAGE_DELAYLOAD_DESCRIPTOR
	} {
		if header.NumberOfRvaAndSizes <= uint32(table.index) {
			continue
		}
		directory := header.DataDirectory[table.index]
		if directory.VirtualAddress == 0 {
			continue
		}
		data, err := rvaData(directory.VirtualAddress)
		if err != nil {
			return nil, err
		}
		for {
			if len(data) < table.size {
				return nil, fmt.Errorf("truncated import descriptor table")
			}
			descriptor := data[:table.size]
			if bytes.Equal(descriptor, make([]byte, table.size)) {
				break
			}
			if table.index == 13 && binary.LittleEndian.Uint32(descriptor[:4])&1 == 0 {
				return nil, fmt.Errorf("unsupported VA-based delay import descriptor")
			}
			nameRVA := binary.LittleEndian.Uint32(descriptor[table.nameOffset:])
			name, err := rvaData(nameRVA)
			if err != nil {
				return nil, err
			}
			end := bytes.IndexByte(name, 0)
			if end <= 0 {
				return nil, fmt.Errorf("invalid import DLL name at RVA %#x", nameRVA)
			}
			imports = append(imports, string(name[:end]))
			data = data[table.size:]
		}
	}
	return imports, nil
}

func dependencies(roots []string, machine uint16, inspect func(string) (peInfo, error), resolve func(string) (string, error)) ([]string, error) {
	seen := map[string]string{}
	var files []string
	var visit func(string) error
	visit = func(path string) error {
		name := strings.ToLower(filepath.Base(path))
		if previous, ok := seen[name]; ok {
			if previous != path {
				return fmt.Errorf("conflicting DLL sources for %s: %s and %s", name, previous, path)
			}
			return nil
		}
		seen[name] = path
		info, err := inspect(path)
		if err != nil {
			return fmt.Errorf("inspect %s: %w", path, err)
		}
		if info.machine != machine {
			return fmt.Errorf("wrong architecture for %s: PE machine %#x, expected %#x", path, info.machine, machine)
		}
		if strings.EqualFold(filepath.Ext(path), ".dll") {
			files = append(files, path)
		}
		for _, dll := range info.imports {
			if strings.ContainsAny(dll, `/\:`) {
				return fmt.Errorf("invalid DLL import %q in %s", dll, path)
			}
			if isSystemDLL(dll) {
				continue
			}
			if !strings.EqualFold(filepath.Ext(dll), ".dll") {
				return fmt.Errorf("invalid DLL import %q in %s", dll, path)
			}
			if _, ok := seen[strings.ToLower(dll)]; ok {
				continue
			}
			dependency, err := resolve(dll)
			if err != nil {
				return fmt.Errorf("%s requires %s: %w", filepath.Base(path), dll, err)
			}
			if err := visit(dependency); err != nil {
				return err
			}
		}
		return nil
	}
	for _, root := range roots {
		if err := visit(root); err != nil {
			return nil, err
		}
	}
	sort.Strings(files)
	return files, nil
}

func resolver(search []string, cc string) func(string) (string, error) {
	if cc != "" {
		if compiler, err := exec.LookPath(cc); err == nil {
			search = append(search, filepath.Dir(compiler))
		}
	}
	return func(name string) (string, error) {
		for _, dir := range search {
			entries, err := os.ReadDir(dir)
			if err != nil {
				if os.IsNotExist(err) {
					continue
				}
				return "", err
			}
			for _, entry := range entries {
				if !entry.IsDir() && strings.EqualFold(entry.Name(), name) {
					return filepath.Join(dir, entry.Name()), nil
				}
			}
		}
		if cc != "" {
			// GCC cross toolchains often keep runtime DLLs outside their bin directory.
			output, err := exec.Command(cc, "-print-file-name="+name).Output()
			if err != nil {
				return "", fmt.Errorf("query compiler %s: %w", cc, err)
			}
			path := strings.TrimSpace(string(output))
			if path != name && path != "" {
				if info, err := os.Stat(path); err == nil && !info.IsDir() {
					return filepath.Clean(path), nil
				}
			}
		}
		return "", fmt.Errorf("not found in runtime directories %v or target compiler %q", search, cc)
	}
}

func isSystemDLL(name string) bool {
	name = strings.ToLower(name)
	if strings.HasPrefix(name, "api-ms-win-") || strings.HasPrefix(name, "ext-ms-win-") {
		return true // Windows API sets, supplied by the supported Windows 10+ OS.
	}
	// Deliberately explicit: an unknown dependency must fail instead of being
	// assumed to exist on the user's machine (especially MinGW/MSVC runtimes).
	switch name {
	case "advapi32.dll", "bcrypt.dll", "bcryptprimitives.dll", "comctl32.dll",
		"comdlg32.dll", "crypt32.dll", "d3d11.dll", "dcomp.dll", "dwmapi.dll",
		"dxgi.dll", "gdi32.dll", "gdiplus.dll", "imm32.dll", "iphlpapi.dll",
		"kernel32.dll", "kernelbase.dll", "msvcrt.dll", "ncrypt.dll", "ntdll.dll",
		"ole32.dll", "oleacc.dll", "oleaut32.dll", "powrprof.dll", "propsys.dll",
		"psapi.dll", "rpcrt4.dll", "secur32.dll", "setupapi.dll", "shell32.dll",
		"shlwapi.dll", "ucrtbase.dll", "user32.dll", "userenv.dll", "uxtheme.dll",
		"version.dll", "winhttp.dll", "wininet.dll", "winmm.dll", "winspool.drv",
		"wintrust.dll", "ws2_32.dll", "wtsapi32.dll":
		return true
	}
	return false
}
