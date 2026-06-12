.PHONY: dev build start test install clean

dev:
	pnpm run dev

build:
	pnpm run build

start:
	pnpm start

test:
	pnpm test

install:
	pnpm install

clean:
	rm -rf dist node_modules
