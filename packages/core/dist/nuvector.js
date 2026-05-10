"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NUVECTOR_RELATIVE_PATH = exports.DEFAULT_TENANT = exports.STORYLINE_EMBEDDING_DIMENSIONS = exports.closeStore = exports.openInMemoryStore = exports.openProjectStore = void 0;
/**
 * `@storyline/core/nuvector` — semantic-memory subpath.
 *
 * Importing from this path pulls the `@nusoft/nuvector` native binary into
 * the consumer's bundle graph; importing from `@storyline/core` does not.
 * NT-05 will wire stage saves and chapter writes through here.
 */
var store_js_1 = require("./memory/nuvector/store.js");
Object.defineProperty(exports, "openProjectStore", { enumerable: true, get: function () { return store_js_1.openProjectStore; } });
Object.defineProperty(exports, "openInMemoryStore", { enumerable: true, get: function () { return store_js_1.openInMemoryStore; } });
Object.defineProperty(exports, "closeStore", { enumerable: true, get: function () { return store_js_1.closeStore; } });
Object.defineProperty(exports, "STORYLINE_EMBEDDING_DIMENSIONS", { enumerable: true, get: function () { return store_js_1.STORYLINE_EMBEDDING_DIMENSIONS; } });
Object.defineProperty(exports, "DEFAULT_TENANT", { enumerable: true, get: function () { return store_js_1.DEFAULT_TENANT; } });
Object.defineProperty(exports, "NUVECTOR_RELATIVE_PATH", { enumerable: true, get: function () { return store_js_1.NUVECTOR_RELATIVE_PATH; } });
//# sourceMappingURL=nuvector.js.map