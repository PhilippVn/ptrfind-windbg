"use strict";

function initializeScript() {
    return [new host.functionAlias(ptrFind, "ptrfind")];
}

// Helper to resolve an alias string (like "ntdll", "image", "stack") to [start, end]
function resolveAlias(nameStr) {
    let name = nameStr.toString().toLowerCase();
    
    if (name === "stack") {
        const teb = host.currentThread.Environment.EnvironmentBlock;
        try {
            return [
                host.parseInt64(teb.NtTib.StackLimit.toString()),
                host.parseInt64(teb.NtTib.StackBase.toString())
            ];
        } catch (e) {
            const tebAddr = teb.targetLocation.address;
            return [
                host.memory.readMemoryValues(tebAddr.add(0x10), 1, 8)[0],
                host.memory.readMemoryValues(tebAddr.add(0x08), 1, 8)[0]
            ];
        }
    } else if (name === "image" || name === "pie") {
        for (let mod of host.currentProcess.Modules) {
            return [
                host.parseInt64(mod.BaseAddress),
                host.parseInt64(mod.BaseAddress).add(mod.Size)
            ];
        }
    } else {
        for (let mod of host.currentProcess.Modules) {
            if (mod.Name.toLowerCase().indexOf(name) !== -1) {
                return [
                    host.parseInt64(mod.BaseAddress),
                    host.parseInt64(mod.BaseAddress).add(mod.Size)
                ];
            }
        }
    }
    return null;
}

function ptrFind(...args) {
    const log = host.diagnostics.debugLog;
    const ptrSize = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize;

    if (args.length === 0 || args[0] === "-?" || args[0] === "help") {
        log("NAME\n");
        log("    !ptrfind - Search a memory range for pointers (or pointer chains) to a specific module or address range.\n\n");
        log("USAGE\n");
        log("    !ptrfind [options] <From> <To>\n");
        log("    <From> and <To> can be ModuleNames, \"stack\", or Hex Ranges (Start, End).\n\n");
        log("OPTIONS\n");
        log("    -a, all      : Search for all matches (default stops at 5)\n");
        log("    -c N         : Max pointer chain depth (e.g., -c 2 for pointer-to-pointer). Default is 1 (direct).\n\n");
        log("EXAMPLES\n");
        log("    !ptrfind(\"kernel32\", \"ntdll\")\n");
        log("    !ptrfind(\"kernel32\", 0x1000, 0x2000)\n");
        log("    !ptrfind(\"-a\", \"stack\", \"image\")\n");
        log("    !ptrfind(\"-c\", 2, @rsp, @rsp+0x1000, \"ntdll\")\n\n");
        return;
    }

    // Parse arguments
    let searchAll = false;
    let maxDepth = 1;
    let parsedArgs = [];

    for (let i = 0; i < args.length; i++) {
        let arg = args[i].toString().toLowerCase();
        if (arg === "-a" || arg === "all") {
            searchAll = true;
        } else if (arg === "-c") {
            maxDepth = parseInt(args[++i].toString(), 10);
        } else {
            parsedArgs.push(args[i]);
        }
    }

    let fromMin, fromMax, toMin, toMax;

    // Helper to extract range from parsed arguments
    function extractRange(startIdx) { // Returns [range, next arg index] -> next index + 1 (alias range) or +2 (numeric range)
        if (startIdx >= parsedArgs.length) return [null, startIdx];
        
        let arg1 = parsedArgs[startIdx];
        if (typeof arg1 === "string" || isNaN(host.parseInt64(arg1).asNumber())) {
            let range = resolveAlias(arg1);
            if (range) return [range, startIdx + 1];
        }
        
        // Try parsing as numeric range (start, end)
        if (startIdx + 1 < parsedArgs.length) {
            return [
                [host.parseInt64(arg1), host.parseInt64(parsedArgs[startIdx + 1])],
                startIdx + 2
            ];
        }
        return [null, startIdx];
    }

    let [fromRange, nextIdx] = extractRange(0);
    if (!fromRange) {
        log("Error: Could not resolve 'From' range.\n");
        return;
    }
    [fromMin, fromMax] = fromRange;

    let [toRange, _] = extractRange(nextIdx);
    if (!toRange) {
        log("Error: Could not resolve 'To' range.\n");
        return;
    }
    [toMin, toMax] = toRange;

    log(`Searching from ${fromMin.toString(16)} - ${fromMax.toString(16)}\n`);
    log(`Targeting ${toMin.toString(16)} - ${toMax.toString(16)}\n`);
    if (maxDepth > 1) log(`Max Chain Depth: ${maxDepth}\n`);

    let foundCount = 0;
    const LIMIT = searchAll ? Infinity : 5;

     // Recursive search function for pointer chains
    function searchLevel(currentAddr, endAddr, currentDepth, chainPrefix) {
        for (let curr = currentAddr; curr.asNumber() < endAddr.asNumber(); curr = curr.add(ptrSize)) {
            // Check if we hit the result limit
            if (foundCount >= LIMIT) {
                return;
            }

            try {
                let val = host.memory.readMemoryValues(curr, 1, ptrSize)[0];
                let val64 = host.parseInt64(val);
                
                // Direct match check
                if (val64.asNumber() >= toMin.asNumber() && val64.asNumber() <= toMax.asNumber()) {
                    let symStr = "";
                    try { symStr = ` (${host.symbols.lookupSymbol(val64)})`; } catch (e) {}
                    
                    log(`${chainPrefix}[${curr.toString(16)}] -> ${val64.toString(16)}${symStr}\n`);
                    foundCount++;
                    
                    if (foundCount >= LIMIT && !searchAll) {
                        log(`\nStopping after ${LIMIT} results. Use '-a' or 'all' to find all.\n`);
                        return;
                    }
                } 
                // Chain search
                else if (currentDepth < maxDepth) {
                    // Check if val64 is a valid readable pointer itself before recursing
                    try {
                        host.memory.readMemoryValues(val64, 1, 1); // Probe
                        searchLevel(val64, val64.add(ptrSize), currentDepth + 1, `${chainPrefix}[${curr.toString(16)}] -> `);
                    } catch (e) { /* Not a valid readable pointer */ }
                }
            } catch (e) {
                // Ignore unmapped pages
            }
        }
    }

    log("Starting scan...\n\n");
    searchLevel(fromMin, fromMax, 1, "");
    log(`\nScan complete. Total found: ${foundCount}\n`);
}