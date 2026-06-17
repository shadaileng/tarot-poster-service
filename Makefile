.PHONY: dev build start test typecheck install clean

dev:
	pnpm run dev

build:
	pnpm run build

start:
	pnpm start

test:
	pnpm test

typecheck:
	pnpm typecheck

install:
	pnpm install

clean:
	rm -rf dist node_modules
