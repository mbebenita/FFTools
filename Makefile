.PHONY: all
SRCS=$(shell find . -name "*.ts")
LIB_SRCS=$(shell find src/lib -name "*.ts")
GUI_SRCS=$(shell find src/gui -name "*.ts")

all: build/lib.js build/cli.js build/gui.js

build/lib.js: src/shared.ts $(LIB_SRCS)
	./node_modules/typescript/bin/tsc --sourcemap --target ES5 src/lib/references.ts -d --out build/lib.js

build/cli.js: src/shared.ts src/cli.ts $(LIB_SRCS)
	./node_modules/typescript/bin/tsc --sourcemap --target ES5 src/cli.ts --out build/cli.js

build/gui.js: src/shared.ts $(GUI_SRCS)
	./node_modules/typescript/bin/tsc --sourcemap --target ES5 src/gui/references.ts -d --out build/gui.js

xpi:
	make -C extension/ build

clean:
	rm -rf build

server:
	python -m SimpleHTTPServer 8888