REPO_ROOT := $(shell git rev-parse --show-toplevel)
BUN       := bun

ifdef zone
ZONE_FLAG := --zone $(zone)
endif

.PHONY: plan apply inspect import

node_modules: package.json bun.lock
	$(BUN) install

plan: node_modules
	cd $(REPO_ROOT) && $(BUN) tools/dnsctl/src/index.ts plan $(ZONE_FLAG)

apply: node_modules
	cd $(REPO_ROOT) && $(BUN) tools/dnsctl/src/index.ts apply $(ZONE_FLAG)

inspect: node_modules
	cd $(REPO_ROOT) && $(BUN) tools/dnsctl/src/index.ts inspect $(ZONE_FLAG)

import: node_modules
	cd $(REPO_ROOT) && $(BUN) tools/dnsctl/src/index.ts import $(ZONE_FLAG)
