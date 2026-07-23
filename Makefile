PORT ?= 8000

.PHONY: help frontend test analyze

help:            ## Visa alla kommandon
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

frontend:        ## Starta webbappen på http://localhost:$(PORT) (tar nästa lediga port om upptagen)
	@port=$(PORT); while lsof -nP -iTCP:$$port -sTCP:LISTEN >/dev/null 2>&1; do port=$$((port+1)); done; \
	echo "Serverar prototype/ på http://localhost:$$port (Ctrl+C stoppar)"; \
	(sleep 1 && open http://localhost:$$port) & \
	python3 -m http.server $$port --directory prototype

test:            ## Kör analysmotorns enhetstester (inget nät krävs)
	cd analysis && npm test

analyze:         ## Kör gap-analysen; flaggor via ARGS="--minYield 3 --basis index"
	cd analysis && node src/cli.js $(ARGS)

validate:        ## Kolla att alla tickers i universum finns på Yahoo; ARGS="--universe mid-cap"
	cd analysis && node src/validate.js $(ARGS)
