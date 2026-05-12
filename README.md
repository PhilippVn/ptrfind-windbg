# Ptrfind for Windbg
A WinDbg JS script for locating pointers across memory ranges.
Port of [ptrfind](https://github.com/ChaChaNop-Slide/ptrfind) to Windows.

Lets you search for pointers from any adress range into any other adress range.
Very usefull if u have arbitrary read/write primitive and need to pivot into other memory regions like kernel32, stack, or heap.

Supports [pointer chains](#finding-pointer-chains) and symbolic searching using aliases instead of ugly memory adresses.



# Load Script
In Windbg: .scriptload <path-to-ptrfind.js>

# Print Usage:
Use !ptrfind

<img width="1207" height="410" alt="image" src="https://github.com/user-attachments/assets/e7327952-3ec4-4e68-9571-49fe05b45827" />

# Examples
You can use direct adress ranges or aliases.

Currently supported aliases are: "stack" (currently selected thread), and any module name like "ntdll", "kernel32, ...

<img width="733" height="439" alt="image" src="https://github.com/user-attachments/assets/f0990681-07d9-469e-b534-d884af8d8419" />

<img width="1205" height="331" alt="image" src="https://github.com/user-attachments/assets/6c2cc767-996a-44ca-a0ea-175e13c8bf26" />

# Finding Pointer Chains
Sometimes there is no direct pointer into the target area but there might be chains of pointers. This tool lets you find them aswell.

Just add the "-c" option to specify the maximum chain depth to recursively search for.

<img width="1208" height="516" alt="image" src="https://github.com/user-attachments/assets/d25fb74a-65c5-4266-ba03-6537fca5f136" />


