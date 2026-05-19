package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"Pulso/emulator/plcserver"
)

func main() {
	profilePath := flag.String("profile", "emulator/profiles/sample-logix.json", "JSON PLC profile path")
	addr := flag.String("addr", "127.0.0.1:44818", "listen address")
	flag.Parse()

	plc, err := plcserver.LoadProfile(*profilePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load profile: %v\n", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server := &plcserver.Server{
		PLC:    plc,
		Addr:   *addr,
		Logger: log.New(os.Stdout, "", log.LstdFlags),
	}
	if err := server.ListenAndServe(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "server: %v\n", err)
		os.Exit(1)
	}
}
