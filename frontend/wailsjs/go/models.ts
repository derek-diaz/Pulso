export namespace backend {
	
	export class WatchListImportResult {
	    imported: number;
	    errors?: string[];
	
	    static createFrom(source: any = {}) {
	        return new WatchListImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.imported = source["imported"];
	        this.errors = source["errors"];
	    }
	}

}

export namespace plc {
	
	export class ConnectionConfig {
	    address: string;
	    path: string;
	    timeoutMs: number;
	    pollIntervalMs: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.address = source["address"];
	        this.path = source["path"];
	        this.timeoutMs = source["timeoutMs"];
	        this.pollIntervalMs = source["pollIntervalMs"];
	    }
	}
	export class ConnectionStatus {
	    state: string;
	    connected: boolean;
	    pollingActive: boolean;
	    config?: ConnectionConfig;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.connected = source["connected"];
	        this.pollingActive = source["pollingActive"];
	        this.config = this.convertValues(source["config"], ConnectionConfig);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DiscoveredTag {
	    name: string;
	    scope: string;
	    dataType?: string;
	    rawType: number;
	    typeId?: number;
	    elementSize: number;
	    elementCount: number;
	    dimensions?: number[];
	    watchable: boolean;
	    unsupportedReason?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiscoveredTag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.scope = source["scope"];
	        this.dataType = source["dataType"];
	        this.rawType = source["rawType"];
	        this.typeId = source["typeId"];
	        this.elementSize = source["elementSize"];
	        this.elementCount = source["elementCount"];
	        this.dimensions = source["dimensions"];
	        this.watchable = source["watchable"];
	        this.unsupportedReason = source["unsupportedReason"];
	    }
	}
	export class TagSnapshot {
	    tagId: string;
	    name: string;
	    dataType: string;
	    currentValue: any;
	    previousValue: any;
	    lastReadAt: string;
	    lastChangedAt: string;
	    readLatencyMs: number;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TagSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tagId = source["tagId"];
	        this.name = source["name"];
	        this.dataType = source["dataType"];
	        this.currentValue = source["currentValue"];
	        this.previousValue = source["previousValue"];
	        this.lastReadAt = source["lastReadAt"];
	        this.lastChangedAt = source["lastChangedAt"];
	        this.readLatencyMs = source["readLatencyMs"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}
	export class WatchedTag {
	    id: string;
	    name: string;
	    dataType: string;
	    elementCount: number;
	    elementSize?: number;
	
	    static createFrom(source: any = {}) {
	        return new WatchedTag(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.dataType = source["dataType"];
	        this.elementCount = source["elementCount"];
	        this.elementSize = source["elementSize"];
	    }
	}
	export class WriteRequest {
	    tagId: string;
	    name: string;
	    dataType: string;
	    requestedValue: any;
	
	    static createFrom(source: any = {}) {
	        return new WriteRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tagId = source["tagId"];
	        this.name = source["name"];
	        this.dataType = source["dataType"];
	        this.requestedValue = source["requestedValue"];
	    }
	}
	export class WriteResult {
	    tagId: string;
	    name: string;
	    success: boolean;
	    requestedValue: any;
	    previousValue: any;
	    readbackValue: any;
	    latencyMs: number;
	    note: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new WriteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tagId = source["tagId"];
	        this.name = source["name"];
	        this.success = source["success"];
	        this.requestedValue = source["requestedValue"];
	        this.previousValue = source["previousValue"];
	        this.readbackValue = source["readbackValue"];
	        this.latencyMs = source["latencyMs"];
	        this.note = source["note"];
	        this.error = source["error"];
	    }
	}

}

