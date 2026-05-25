package main

import (
	"embed"

	"Pulso/backend"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	app := backend.NewApp()

	err := wails.Run(&options.App{
		Title:  "Pulso",
		Width:  1440,
		Height: 900,
		MinWidth:  1180,
		MinHeight: 720,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 9, G: 14, B: 20, A: 1},
		OnStartup:        app.Startup,
		Mac: &mac.Options{
			About: &mac.AboutInfo{
				Title: "Pulso",
				Icon:  appIcon,
			},
		},
		Linux: &linux.Options{
			Icon:        appIcon,
			ProgramName: "Pulso",
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
