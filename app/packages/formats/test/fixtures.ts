// Example circuits from Paul Falstad's CircuitJS1 (GPL-2.0-or-later):
// https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/public/circuits

/** cap.txt — RC charging with a double-throw switch. */
export const CAP_TXT = `$ 1 0.000005 16.13108636308289 50 5 50
v 96 336 96 64 0 0 40 5 0 0 0.5
S 256 144 256 64 0 0 false 0 2
w 96 64 240 64 0
w 272 64 400 64 0
w 400 64 400 336 0
c 256 144 256 256 0 0.00019999999999999998 0
r 256 256 256 336 0 100
w 96 336 256 336 0
w 256 336 400 336 0
o 5 128 0 4099 5 0.05 0 2 5 3
& 5 0 0.000009999999999999999 0.00101 Capacitance
h 2 6 5
`;

/** lrc.txt — the LRC circuit the simulator loads at startup. */
export const LRC_TXT = `$ 1 0.000005 10.20027730826997 50 5 43 5e-11
r 176 80 384 80 0 10
s 384 80 448 80 0 1 false
w 176 80 176 352 0
c 384 352 176 352 0 0.000015 -9.86 -10
l 384 80 384 352 0 1 0.03 0
v 448 352 448 80 0 0 40 5 0 0 0.5
r 384 352 448 352 0 100
o 4 64 0 4099 20 0.05 0 2 4 3
o 3 64 0 4099 20 0.05 1 2 3 3
o 0 64 0 4099 0.625 0.05 2 2 0 3
38 3 0 0.000001 0.000101 Capacitance
38 4 0 0.01 1.01 Inductance
38 0 0 1 101 Resistance
h 1 4 3
`;

/** ohms.txt — Ohm's law, with ground symbols and a variable rail. */
export const OHMS_TXT = `$ 1 5.0E-6 10.391409633455755 50 5.0 50
r 256 176 256 304 0 100.0
172 304 176 304 128 0 6 5.0 5.0 0.0 0.0 0.5 Voltage
g 256 336 256 352 0
w 256 304 256 336 1
r 352 176 352 304 0 1000.0
w 352 304 352 336 1
g 352 336 352 352 0
w 304 176 352 176 0
w 256 176 304 176 0
`;
