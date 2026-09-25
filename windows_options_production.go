//go:build windows && production

package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed build/windows/webview2-runtime.json
var webview2Manifest []byte

func windowsOptions() (*windows.Options, error) {
	var runtime struct{ Version string }
	if err := json.Unmarshal(webview2Manifest, &runtime); err != nil || runtime.Version == "" {
		return nil, fmt.Errorf("invalid bundled WebView2 manifest")
	}
	executable, err := os.Executable()
	if err != nil {
		return nil, err
	}
	messages := windows.DefaultMessages()
	messages.InvalidFixedWebview2 = "Pulso's bundled browser files are missing or damaged. Please reinstall Pulso."
	return &windows.Options{
		// Always select the bundled version, independent of working directory or
		// any shared WebView2 installation. Wails fails if this folder is invalid.
		WebviewBrowserPath: filepath.Join(filepath.Dir(executable), "WebView2", runtime.Version),
		Messages:           messages,
	}, nil
}
