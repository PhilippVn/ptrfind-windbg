"use strict";

function initializeScript() {
    return [new host.functionAlias(ptrFind, "ptrfind")];
}

function ptrFind(fromStart, fromEnd, toStartOrMod, toEnd) {
    const log = host.diagnostics.debugLog;
    const ptrSize = host.namespace.Debugger.State.PseudoRegisters.General.ptrsize;

    if (fromStart === undefined || fromStart === "-?" || fromStart === "help") {
        log("NAME\n");
        log("    !ptrfind - Search a memory range for pointers to a specific module or address range.\n\n");
        log("USAGE\n");
        log("    !ptrfind <SearchStart> <SearchEnd> <ModuleName|TargetStart> [<TargetEnd>]\n\n");
        log("ARGUMENTS\n");
        log("    SearchStart : The address to begin scanning from.\n");
        log("    SearchEnd   : The address to stop scanning.\n");
        log("    ModuleName  : String name of a module (e.g., \"ntdll\", \"image\" for main EXE).\n");
        log("    TargetStart : If not a module name, the start of the target address range.\n");
        log("    TargetEnd   : Required if TargetStart is used; the end of the target range.\n\n");
        log("EXAMPLES\n");
        log("    !ptrfind(@rsp,@rsp+0x1000, \"ntdll\")          - Find ntdll pointers on the stack\n");
        log("    !ptrfind(0x5000,0x9000,0x77000,0x78000)   - Find pointers to a specific range\n");
        log("    !ptrfind(@rax,@rax+0x100,\"image\")           - Find pointers to the main executable\n\n");
        return;
    }

    // Helper to ensure we are working with 64-bit debugger objects
    function to64(val) {
        return host.parseInt64(val);
    }

    try {
        let start = to64(fromStart);
        let end = to64(fromEnd);
        let targetMin = null;
        let targetMax = null;

        let searchName = toStartOrMod.toString().toLowerCase();

        // 1. Resolve Module or Image/Stack
       if (searchName === "stack") {
    try {
        const teb = host.currentThread.Environment.EnvironmentBlock;

        try {
            // PVOID typed values must go through .toString() → parseInt64
            // to become usable UInt64s for arithmetic and comparison
            targetMax = host.parseInt64(teb.NtTib.StackBase.toString());
            targetMin = host.parseInt64(teb.NtTib.StackLimit.toString());
        } catch (symErr) {
            const tebAddr = teb.targetLocation.address;
            targetMax = host.memory.readMemoryValues(tebAddr.add(0x08), 1, 8)[0];
            targetMin = host.memory.readMemoryValues(tebAddr.add(0x10), 1, 8)[0];
        }

    } catch (e) {
        log("\n--- STACK RESOLUTION FAILURE ---\n");
        log(`Error: ${e.message}\n`);
        return;
    }
    log(`>>> Resolved "stack" to: ${targetMin.toString(16)} - ${targetMax.toString(16)}\n`);
}
        else if (searchName === "image" || searchName === "pie") {
            for (let mod of host.currentProcess.Modules) {
                targetMin = to64(mod.BaseAddress);
                targetMax = targetMin.add(mod.Size);
                log(`Resolved "${searchName}" to: ${mod.Name}\n`);
                break; 
            }
        } else {
            for (let mod of host.currentProcess.Modules) {
                if (mod.Name.toLowerCase().indexOf(searchName) !== -1) {
                    targetMin = to64(mod.BaseAddress);
                    targetMax = to64(mod.BaseAddress).add(mod.Size);
                    log(`Resolved "${searchName}" to: ${mod.Name}\n`);
                    break;
                }
            }
        }

        // 2. Fallback to Hex Range
        if (targetMin === null) {
            targetMin = to64(toStartOrMod);
            if (toEnd === undefined) {
                log("Error: Module not found. For hex search, provide an end address.\n");
                return;
            }
            targetMax = to64(toEnd);
        }

        log(`Searching ${start.toString(16)} to ${end.toString(16)}...\n\n`);

        // 3. Scan loop using standard math if objects fail, 
        let found = 0;
        for (let curr = start; curr.asNumber() < end.asNumber(); curr = curr.add(ptrSize)) {
            try {
                let val = host.memory.readMemoryValues(curr, 1, ptrSize)[0];
                let val64 = to64(val);
                
                if (val64.asNumber() >= targetMin.asNumber() && val64.asNumber() <= targetMax.asNumber()) {
                    let symStr = "";
                    try {
                        symStr = ` (${host.symbols.lookupSymbol(val64)})`;
                    } catch (e) {}
                    log(`[${curr.toString(16)}] -> ${val64.toString(16)}${symStr}\n`);
                    found += 1;
                }
            } catch (e) {
                // Ignore memory read errors (unmapped pages)
            }
        }
        log(`\nScan complete. Found: ${found} matches\n`);

    } catch (err) {
        log("Error: " + err + "\n");
    }
}