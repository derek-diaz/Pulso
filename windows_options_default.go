//go:build !windows || !production

package main

import "github.com/wailsapp/wails/v2/pkg/options/windows"

// Development and bindings generation use the developer's shared runtime.
func windowsOptions() (*windows.Options, error) { return nil, nil }
