---
title: List of Circuits
description: Every example circuit in Paul Falstad's circuit simulator, grouped by menu category, with the circuits added since 2013 marked.
---

# List of Circuits

This page lists every example circuit in the **Circuits** menu of Paul Falstad's [circuit simulator](https://www.falstad.com/circuit/). There are 366 entries (365 unique circuit files) in 56 categories.

## Sources

The list has two sources:

- **Current list.** The categories, names, and order come from [`src/com/lushprojects/circuitjs1/public/setuplist.txt`](https://github.com/pfalstad/circuitjs1/blob/5a707168778216bb6ed01bfdd62e8bbf7ae0a032/src/com/lushprojects/circuitjs1/public/setuplist.txt) in [pfalstad/circuitjs1](https://github.com/pfalstad/circuitjs1), Paul Falstad's repository for the browser version of the simulator, at commit `5a70716` (setuplist.txt last changed on 2026-07-07). Each entry links to its circuit file there, which can be opened in the simulator.
- **2013 list.** The first version of this page was built from [`src/setuplist.txt`](https://github.com/hausen/circuit-simulator/blob/master/src/setuplist.txt) in [hausen/circuit-simulator](https://github.com/hausen/circuit-simulator), a fork of the older Java simulator whose circuit list dates from 2013-05-08. The current list was compared against it, file by file.

Since 2013, 87 circuits and 12 categories have been added, and none have been removed. A circuit that was not in the 2013 list is marked **New since the 2013 list**. A circuit that has moved to another category or been renamed says so in its entry.

Where the menu nests a submenu inside a category, the heading shows every level, such as **Op-Amps: Amplifiers**. The circuit names are the menu labels, so a short name like *I/V Curve* is read together with its category heading. The menu's *Blank Circuit* item is an empty starting point, not a circuit, so it is not listed. The repository also holds a few example files that are not in the menu, such as the AVR8js microcontroller demos, and these are not listed either.

## Basics

### Ohm's Law

Circuit file: [`ohms.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ohms.txt)

### Resistors

Circuit file: [`resistors.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/resistors.txt)

### Capacitor

Circuit file: [`cap.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cap.txt)

### Inductor

Circuit file: [`induct.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/induct.txt)

### LRC Circuit

Circuit file: [`lrc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/lrc.txt)

This is the circuit the simulator loads at startup.

### Voltage Divider

Circuit file: [`voltdivide.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/voltdivide.txt)

### Potentiometer

Circuit file: [`pot.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pot.txt)

### Potentiometer Divider

Circuit file: [`potdivide.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/potdivide.txt)

### Thevenin's Theorem

Circuit file: [`thevenin.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/thevenin.txt)

### Norton's Theorem

Circuit file: [`norton.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/norton.txt)

## A/C Circuits

### Capacitor

Circuit file: [`capac.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/capac.txt)

### Inductor

Circuit file: [`inductac.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/inductac.txt)

### Caps of Various Capacitances

Circuit file: [`capmultcaps.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/capmultcaps.txt)

### Caps w/ Various Frequencies

Circuit file: [`capmultfreq.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/capmultfreq.txt)

### Inductors of Various Inductances

Circuit file: [`indmultind.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/indmultind.txt)

### Inductors w/ Various Frequencies

Circuit file: [`indmultfreq.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/indmultfreq.txt)

### Impedances of Same Magnitude

Circuit file: [`impedance.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/impedance.txt)

### Series Resonance

Circuit file: [`res-series.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/res-series.txt)

### Parallel Resonance

Circuit file: [`res-par.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/res-par.txt)

## Passive Filters

6 of the 17 circuits are new since the 2013 list.

### High-Pass Filter (RC)

Circuit file: [`filt-hipass.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/filt-hipass.txt)

### Low-Pass Filter (RC)

Circuit file: [`filt-lopass.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/filt-lopass.txt)

### High-Pass Filter (RL)

Circuit file: [`filt-hipass-l.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/filt-hipass-l.txt)

### Low-Pass Filter (RL)

Circuit file: [`filt-lopass-l.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/filt-lopass-l.txt)

### Band-pass Filter

Circuit file: [`bandpass.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/bandpass.txt)

### Band-pass w/ Noise

Circuit file: [`bandnoise.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/bandnoise.txt)

**New since the 2013 list.**

### Notch Filter

Circuit file: [`notch.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/notch.txt)

### Twin-T Filter

Circuit file: [`twint.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/twint.txt)

### Crossover

Circuit file: [`crossover.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/crossover.txt)

### Butterworth Low-Pass (10 pole)

Circuit file: [`butter10lo.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/butter10lo.txt)

### Butterworth High-Pass (10 pole)

Circuit file: [`butter10hi.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/butter10hi.txt)

**New since the 2013 list.**

### Butterworth Low-Pass w/ Noise

Circuit file: [`butter10loaud.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/butter10loaud.txt)

**New since the 2013 list.**

### Butterworth High-Pass w/ Noise

Circuit file: [`butter10hiaud.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/butter10hiaud.txt)

**New since the 2013 list.**

### Butterworth Band-Stop

Circuit file: [`butterbandstop.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/butterbandstop.txt)

**New since the 2013 list.**

### Bessel vs Butterworth

Circuit file: [`besselbutter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/besselbutter.txt)

### Band-pass with Ringing

Circuit file: [`ringing.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ringing.txt)

### Comb Filter

Circuit file: [`comb.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/comb.txt)

**New since the 2013 list.**

## Other Passive Circuits

1 of the 15 circuit is new since the 2013 list.

### 3-Way Light Switches

Circuit file: [`3way.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3way.txt)

### 3- and 4-Way Light Switches

Circuit file: [`4way.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/4way.txt)

### Differentiator

Circuit file: [`diff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/diff.txt)

### Wheatstone Bridge

Circuit file: [`wheatstone.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/wheatstone.txt)

### Critically Damped LRC

Circuit file: [`lrc-critical.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/lrc-critical.txt)

### Current Source

Circuit file: [`currentsrcelm.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/currentsrcelm.txt)

### Inductive Kickback

Circuit file: [`inductkick.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/inductkick.txt)

### Blocking Inductive Kickback

Circuit file: [`inductkick-snub.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/inductkick-snub.txt)

### Power Factor

Circuit file: [`powerfactor1.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/powerfactor1.txt)

### Power Factor Correction

Circuit file: [`powerfactor2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/powerfactor2.txt)

### Resistor Grid

Circuit file: [`grid.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/grid.txt)

### Resistor Grid 2

Circuit file: [`grid2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/grid2.txt)

### Resistor Cube

Circuit file: [`cube.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cube.txt)

### Phase-Sequence Network

Circuit file: [`phaseseq.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/phaseseq.txt)

### 3-Phase Wye-Wye Balanced Load

Circuit file: [`3phasewye.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3phasewye.txt)

**New since the 2013 list.**

## Other Passive Circuits: Series/Parallel

### Inductors in Series

Circuit file: [`indseries.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/indseries.txt)

### Inductors in Parallel

Circuit file: [`indpar.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/indpar.txt)

### Caps in Series

Circuit file: [`capseries.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/capseries.txt)

### Caps in Parallel

Circuit file: [`cappar.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cappar.txt)

## Other Passive Circuits: Transformers

### Transformer

Circuit file: [`transformer.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/transformer.txt)

### Transformer w/ DC

Circuit file: [`transformerdc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/transformerdc.txt)

### Step-Up Transformer

Circuit file: [`transformerup.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/transformerup.txt)

### Step-Down Transformer

Circuit file: [`transformerdown.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/transformerdown.txt)

### Long-Distance Power Transmission

Circuit file: [`longdist.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/longdist.txt)

## Other Passive Circuits: Transformers: Saturable Core

This category is new since the 2013 list.

### Saturable vs Linear Inductor (DC)

Circuit file: [`satcore-inductor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/satcore-inductor.txt)

**New since the 2013 list.**

### Low vs High Drive (AC Saturation)

Circuit file: [`satcore-comparison.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/satcore-comparison.txt)

**New since the 2013 list.**

### Transformer with Saturable Core

Circuit file: [`satcore-transformer.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/satcore-transformer.txt)

**New since the 2013 list.**

## Other Passive Circuits: Relays

1 of the 9 circuit is new since the 2013 list.

### Relay

Circuit file: [`relay.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relay.txt)

### Relay AND

Circuit file: [`relayand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relayand.txt)

### Relay OR

Circuit file: [`relayor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relayor.txt)

### Relay XOR

Circuit file: [`relayxor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relayxor.txt)

### Relay Mux

Circuit file: [`relaymux.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relaymux.txt)

### Relay Flip-Flop

Circuit file: [`relayff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relayff.txt)

### Relay Toggle Flip-Flop

Circuit file: [`relaytff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relaytff.txt)

### Relay Oscillator

Circuit file: [`relayosc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relayosc.txt)

**New since the 2013 list.**

### Relay Counter

Circuit file: [`relayctr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relayctr.txt)

## Other Passive Circuits: Coupled LC's

### LC Modes (2)

Circuit file: [`coupled1.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/coupled1.txt)

### Weak Coupling

Circuit file: [`coupled2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/coupled2.txt)

### LC Modes (3)

Circuit file: [`coupled3.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/coupled3.txt)

### LC Ladder

Circuit file: [`ladder.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ladder.txt)

## Diodes

### Diode

Circuit file: [`diodevar.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/diodevar.txt)

### Diode I/V Curve

Circuit file: [`diodecurve.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/diodecurve.txt)

### Half-Wave Rectifier

Circuit file: [`rectify.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/rectify.txt)

### Full-Wave Rectifier

Circuit file: [`fullrect.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/fullrect.txt)

### Full-Wave Rectifier w/ Filter

Circuit file: [`fullrectf.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/fullrectf.txt)

### Diode Limiter

Circuit file: [`diodelimit.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/diodelimit.txt)

### DC Restoration

Circuit file: [`dcrestoration.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/dcrestoration.txt)

### Blocking Inductive Kickback

Circuit file: [`inductkick-block.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/inductkick-block.txt)

### Spike Generator

Circuit file: [`spikegen.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/spikegen.txt)

### AM Detector

Circuit file: [`amdetect.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amdetect.txt)

### Waveform Clipper

Circuit file: [`diodeclip.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/diodeclip.txt)

### Triangle-to-Sine Converter

Circuit file: [`sinediode.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/sinediode.txt)

### Ring Modulator

Circuit file: [`ringmod.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ringmod.txt)

## Diodes: Zener Diodes

### I/V Curve

Circuit file: [`zeneriv.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/zeneriv.txt)

### Voltage Reference

Circuit file: [`zenerref.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/zenerref.txt)

### Voltage Reference w/ Follower

Circuit file: [`zenerreffollow.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/zenerreffollow.txt)

## Diodes: Voltage Multipliers

### Voltage Doubler

Circuit file: [`voltdouble.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/voltdouble.txt)

### Voltage Doubler 2

Circuit file: [`voltdouble2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/voltdouble2.txt)

### Voltage Tripler

Circuit file: [`volttriple.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/volttriple.txt)

### Voltage Quadrupler

Circuit file: [`voltquad.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/voltquad.txt)

## Op-Amps

1 of the 19 circuit is new since the 2013 list.

### Op-Amp

Circuit file: [`opamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/opamp.txt)

### Op-Amp Feedback

Circuit file: [`opampfeedback.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/opampfeedback.txt)

### Half-Wave Rectifier (inverting)

Circuit file: [`amp-rect.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-rect.txt)

### Full-Wave Rectifier

Circuit file: [`amp-fullrect.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-fullrect.txt)

### Peak Detector

Circuit file: [`peak-detect.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/peak-detect.txt)

### Integrator

Circuit file: [`amp-integ.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-integ.txt)

### Differentiator (inverting)

Circuit file: [`amp-dfdx.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-dfdx.txt)

The 2013 list called it *Differentiator*.

### Schmitt Trigger

Circuit file: [`amp-schmitt.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-schmitt.txt)

### Negative Impedance Converter

Circuit file: [`nic-r.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/nic-r.txt)

### Gyrator

Circuit file: [`gyrator.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/gyrator.txt)

### Capacitance Multiplier

Circuit file: [`capmult.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/capmult.txt)

### Howland Current Source

Circuit file: [`howland.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/howland.txt)

### I-to-V Converter

Circuit file: [`itov.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/itov.txt)

### Delta PWM Encoder

Circuit file: [`delta-pwm.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/delta-pwm.txt)

**New since the 2013 list.**

### Voltage Regulator

Circuit file: [`opamp-regulator.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/opamp-regulator.txt)

### 741 Internals

Circuit file: [`opint.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/opint.txt)

### 741 (inverting amplifier)

Circuit file: [`opint-invert-amp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/opint-invert-amp.txt)

### 741 Slew Rate

Circuit file: [`opint-slew.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/opint-slew.txt)

### 741 Current Limits

Circuit file: [`opint-current.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/opint-current.txt)

## Op-Amps: Amplifiers

### Inverting Amplifier

Circuit file: [`amp-invert.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-invert.txt)

### Noninverting Amplifier

Circuit file: [`amp-noninvert.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-noninvert.txt)

### Follower

Circuit file: [`amp-follower.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-follower.txt)

### Differential Amplifier

Circuit file: [`amp-diff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-diff.txt)

### Summing Amplifier

Circuit file: [`amp-sum.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/amp-sum.txt)

### Log Amplifier

Circuit file: [`logconvert.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/logconvert.txt)

### Class-D Amplifier

Circuit file: [`classd.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/classd.txt)

## Op-Amps: Oscillators

1 of the 7 circuit is new since the 2013 list.

### Relaxation Oscillator

Circuit file: [`relaxosc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/relaxosc.txt)

### Phase-Shift Oscillator

Circuit file: [`phaseshiftosc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/phaseshiftosc.txt)

### Triangle Wave Generator

Circuit file: [`triangle.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/triangle.txt)

### Sine Wave Generator

Circuit file: [`sine.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/sine.txt)

### Sawtooth Wave Generator

Circuit file: [`sawtooth.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/sawtooth.txt)

### Voltage-Controlled Oscillator

Circuit file: [`vco.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/vco.txt)

### Triangle VCO

Circuit file: [`trianglevco.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/trianglevco.txt)

**New since the 2013 list.**

## Op-Amps: Chaotic Circuits

This category is new since the 2013 list.

### Rossler

Circuit file: [`rossler.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/rossler.txt)

In the 2013 list this was under **Op-Amps: Oscillators**. The 2013 list called it *Rossler Circuit*.

### Vilnius

Circuit file: [`vilnius.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/vilnius.txt)

**New since the 2013 list.**

### Chua

Circuit file: [`chua.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/chua.txt)

**New since the 2013 list.**

### Chaos 1

Circuit file: [`chaos1.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/chaos1.txt)

**New since the 2013 list.**

### Chaos 2

Circuit file: [`chaos2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/chaos2.txt)

**New since the 2013 list.**

### Jerk

Circuit file: [`jerk.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/jerk.txt)

**New since the 2013 list.**

## Transistors

5 of the 16 circuits are new since the 2013 list.

### NPN Transistor

Circuit file: [`npn.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/npn.txt)

### PNP Transistor

Circuit file: [`pnp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pnp.txt)

### Switch

Circuit file: [`transswitch.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/transswitch.txt)

### Emitter Follower

Circuit file: [`follower.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/follower.txt)

### Common-Emitter Amplifier

Circuit file: [`ceamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ceamp.txt)

### Unity-Gain Phase Splitter

Circuit file: [`phasesplit.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/phasesplit.txt)

### Schmitt Trigger

Circuit file: [`schmitt.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/schmitt.txt)

### Current Source

Circuit file: [`currentsrc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/currentsrc.txt)

### Current Source Ramp

Circuit file: [`currentsrcramp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/currentsrcramp.txt)

### Current Mirror

Circuit file: [`mirror.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mirror.txt)

### Darlington Pair

Circuit file: [`darlington.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/darlington.txt)

### Gilbert Cell Multiplier

Circuit file: [`gilbertcell.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/gilbertcell.txt)

**New since the 2013 list.**

### True RMS Converter

Circuit file: [`rmsconverter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/rmsconverter.txt)

**New since the 2013 list.**

### Joule Thief

Circuit file: [`joule-thief.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/joule-thief.txt)

**New since the 2013 list.**

### Full-Wave Rectifier

Circuit file: [`transrectifier.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/transrectifier.txt)

**New since the 2013 list.**

### Early Effect

Circuit file: [`early.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/early.txt)

**New since the 2013 list.**

## Transistors: Multivibrators

### Astable Multivib

Circuit file: [`multivib-a.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/multivib-a.txt)

### Bistable Multivib (Flip-Flop)

Circuit file: [`multivib-bi.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/multivib-bi.txt)

### Monostable Multivib (One-Shot)

Circuit file: [`multivib-mono.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/multivib-mono.txt)

## Transistors: Differential Amplifiers

### Differential Input

Circuit file: [`trans-diffamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/trans-diffamp.txt)

### Common-Mode Input

Circuit file: [`trans-diffamp-common.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/trans-diffamp-common.txt)

### Common-Mode w/Current Source

Circuit file: [`trans-diffamp-cursrc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/trans-diffamp-cursrc.txt)

## Transistors: Push-Pull Follower

### Simple, with distortion

Circuit file: [`pushpullxover.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pushpullxover.txt)

### Improved

Circuit file: [`pushpull.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pushpull.txt)

## Transistors: Oscillators

1 of the 4 circuit is new since the 2013 list.

### Colpitts Oscillator

Circuit file: [`colpitts.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/colpitts.txt)

### Hartley Oscillator

Circuit file: [`hartley.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/hartley.txt)

### Emitter-Coupled LC Oscillator

Circuit file: [`eclosc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/eclosc.txt)

### Crystal Oscillator

Circuit file: [`crystalosc2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/crystalosc2.txt)

**New since the 2013 list.**

## MOSFETs

1 of the 21 circuit is new since the 2013 list.

### n-MOSFET

Circuit file: [`nmosfet.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/nmosfet.txt)

### p-MOSFET

Circuit file: [`pmosfet.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pmosfet.txt)

### Switch

Circuit file: [`mosswitch.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mosswitch.txt)

### Source Follower

Circuit file: [`mosfollower.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mosfollower.txt)

### Current Source

Circuit file: [`moscurrentsrc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/moscurrentsrc.txt)

### Current Ramp

Circuit file: [`moscurrentramp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/moscurrentramp.txt)

### Current Mirror

Circuit file: [`mosmirror.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mosmirror.txt)

### Common-Source Amplifier

Circuit file: [`mosfetamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mosfetamp.txt)

### CMOS Inverter

Circuit file: [`cmosinverter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosinverter.txt)

Also listed under **Logic Families: CMOS**.

### CMOS Inverter (w/capacitance)

Circuit file: [`cmosinvertercap.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosinvertercap.txt)

### CMOS Inverter (slow transition)

Circuit file: [`cmosinverterslow.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosinverterslow.txt)

### CMOS Transmission Gate

Circuit file: [`cmostransgate.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmostransgate.txt)

### CMOS Multiplexer

Circuit file: [`mux.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mux.txt)

### Sample-and-Hold

Circuit file: [`samplenhold.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/samplenhold.txt)

### Delayed Buffer

Circuit file: [`delayrc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/delayrc.txt)

### Leading-Edge Detector

Circuit file: [`leadingedge.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/leadingedge.txt)

### Switchable Filter

Circuit file: [`switchfilter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/switchfilter.txt)

### Voltage Inverter

Circuit file: [`voltinvert.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/voltinvert.txt)

### Inverter Amplifier

Circuit file: [`invertamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/invertamp.txt)

### Inverter Oscillator

Circuit file: [`inv-osc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/inv-osc.txt)

### CMOS Crystal Oscillator

Circuit file: [`crystalosc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/crystalosc.txt)

**New since the 2013 list.**

## 555 Timer Chip

1 of the 10 circuit is new since the 2013 list.

### Square Wave Generator

Circuit file: [`555square.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555square.txt)

### Internals

Circuit file: [`555int.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555int.txt)

### Sawtooth Oscillator

Circuit file: [`555saw.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555saw.txt)

### Low-duty-cycle Oscillator

Circuit file: [`555lowduty.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555lowduty.txt)

### Monostable Multivibrator

Circuit file: [`555monostable.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555monostable.txt)

### Pulse Width Modulator

Circuit file: [`555pulsemod.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555pulsemod.txt)

### Pulse Sequencer

Circuit file: [`555sequencer.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555sequencer.txt)

### Schmitt Trigger (inverting)

Circuit file: [`555schmitt.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555schmitt.txt)

### Missing Pulse Detector

Circuit file: [`555missing.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555missing.txt)

### Adjustable Duty Cycle Oscillator

Circuit file: [`555dutycycle.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/555dutycycle.txt)

**New since the 2013 list.**

## Active Filters

3 of the 8 circuits are new since the 2013 list.

### VCVS Low-Pass Filter

Circuit file: [`filt-vcvs-lopass.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/filt-vcvs-lopass.txt)

### VCVS High-Pass Filter

Circuit file: [`filt-vcvs-hipass.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/filt-vcvs-hipass.txt)

### Switched-Capacitor Filter

Circuit file: [`switchedcap.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/switchedcap.txt)

### Allpass

Circuit file: [`allpass1.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/allpass1.txt)

### Allpass w/ Square

Circuit file: [`allpass2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/allpass2.txt)

### Butterworth Low-Pass

Circuit file: [`actbutterlo.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/actbutterlo.txt)

**New since the 2013 list.**

### Butterworth High-Pass

Circuit file: [`actbutterhi.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/actbutterhi.txt)

**New since the 2013 list.**

### Butterworth Band-Pass

Circuit file: [`actbutterband.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/actbutterband.txt)

**New since the 2013 list.**

## Logic Families: RTL

### RTL Inverter

Circuit file: [`rtlinverter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/rtlinverter.txt)

### RTL NOR

Circuit file: [`rtlnor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/rtlnor.txt)

### RTL NAND

Circuit file: [`rtlnand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/rtlnand.txt)

## Logic Families: DTL

### DTL Inverter

Circuit file: [`dtlinverter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/dtlinverter.txt)

### DTL NAND

Circuit file: [`dtlnand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/dtlnand.txt)

### DTL NOR

Circuit file: [`dtlnor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/dtlnor.txt)

## Logic Families: TTL

1 of the 4 circuit is new since the 2013 list.

### TTL Inverter

Circuit file: [`ttlinverter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ttlinverter.txt)

### TTL NAND

Circuit file: [`ttlnand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ttlnand.txt)

### TTL NOR

Circuit file: [`ttlnor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ttlnor.txt)

### Fan-Out

Circuit file: [`fanout.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/fanout.txt)

**New since the 2013 list.**

## Logic Families: NMOS

1 of the 4 circuit is new since the 2013 list.

### NMOS Inverter

Circuit file: [`nmosinverter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/nmosinverter.txt)

### Inverter with only MOSFETs

Circuit file: [`nmosinverter2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/nmosinverter2.txt)

The 2013 list called it *NMOS Inverter 2*.

### Depletion-load NMOS Inverter

Circuit file: [`nmosinverter3.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/nmosinverter3.txt)

**New since the 2013 list.**

### NMOS NAND

Circuit file: [`nmosnand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/nmosnand.txt)

## Logic Families: CMOS

### CMOS Inverter

Circuit file: [`cmosinverter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosinverter.txt)

Also listed under **MOSFETs**.

### CMOS NAND

Circuit file: [`cmosnand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosnand.txt)

### CMOS NOR

Circuit file: [`cmosnor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosnor.txt)

### CMOS XOR

Circuit file: [`cmosxor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosxor.txt)

### CMOS Flip-Flop

Circuit file: [`cmosff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosff.txt)

### CMOS Master-Slave Flip-Flop

Circuit file: [`cmosmsff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cmosmsff.txt)

## Logic Families: ECL

### ECL NOR/OR

Circuit file: [`eclnor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/eclnor.txt)

## Logic Families: Ternary

### CGAND

Circuit file: [`3-cgand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3-cgand.txt)

### CGOR

Circuit file: [`3-cgor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3-cgor.txt)

### Complement (F210)

Circuit file: [`3-invert.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3-invert.txt)

### F211

Circuit file: [`3-f211.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3-f211.txt)

### F220

Circuit file: [`3-f220.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3-f220.txt)

### F221

Circuit file: [`3-f221.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3-f221.txt)

## Combinational Logic

3 of the 11 circuits are new since the 2013 list.

### Exclusive OR

Circuit file: [`xor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/xor.txt)

### Half Adder

Circuit file: [`halfadd.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/halfadd.txt)

### Full Adder

Circuit file: [`fulladd.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/fulladd.txt)

### 1-of-4 Decoder

Circuit file: [`decoder.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/decoder.txt)

### Priority Encoder

Circuit file: [`priencoder.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/priencoder.txt)

**New since the 2013 list.**

### 2-to-1 Mux

Circuit file: [`mux3state.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mux3state.txt)

### Majority Logic

Circuit file: [`majority.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/majority.txt)

### 2-Bit Comparator

Circuit file: [`digcompare.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/digcompare.txt)

### 7-Segment LED Decoder

Circuit file: [`7segdecoder.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/7segdecoder.txt)

### Brent-Kung Adder

Circuit file: [`brentkung.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/brentkung.txt)

**New since the 2013 list.**

### 74181 ALU

Circuit file: [`alu74181.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/alu74181.txt)

**New since the 2013 list.**

## Sequential Logic

1 of the 6 circuit is new since the 2013 list.

### Divide-by-2

Circuit file: [`divideby2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/divideby2.txt)

### Divide-by-3

Circuit file: [`divideby3.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/divideby3.txt)

### LED Flasher

Circuit file: [`ledflasher.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ledflasher.txt)

### Traffic Light

Circuit file: [`traffic.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/traffic.txt)

### Static RAM

Circuit file: [`sram.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/sram.txt)

**New since the 2013 list.**

### Dynamic RAM

Circuit file: [`dram.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/dram.txt)

## Sequential Logic: Flip-Flops

### SR Flip-Flop

Circuit file: [`nandff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/nandff.txt)

### Clocked SR Flip-Flop

Circuit file: [`clockedsrff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/clockedsrff.txt)

### Master-Slave Flip-Flop

Circuit file: [`masterslaveff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/masterslaveff.txt)

### Edge-Triggered D Flip-Flop

Circuit file: [`edgedff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/edgedff.txt)

### JK Flip-Flop

Circuit file: [`jkff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/jkff.txt)

## Sequential Logic: Counters

2 of the 8 circuits are new since the 2013 list.

### 4-Bit Ripple Counter

Circuit file: [`counter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/counter.txt)

### 8-Bit Ripple Counter

Circuit file: [`counter8.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/counter8.txt)

### Synchronous Counter

Circuit file: [`synccounter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/synccounter.txt)

### Up/Down Counter

Circuit file: [`updownctr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/updownctr.txt)

**New since the 2013 list.**

### Decimal Counter

Circuit file: [`deccounter.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/deccounter.txt)

### Gray Code Counter

Circuit file: [`graycode.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/graycode.txt)

### Johnson Counter

Circuit file: [`johnsonctr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/johnsonctr.txt)

### Cascading Ring Counters

Circuit file: [`ringcascade.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ringcascade.txt)

**New since the 2013 list.**

## Sequential Logic: Shift Registers

This category is new since the 2013 list.

### Serial-In Parallel-Out

Circuit file: [`sipo-sr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/sipo-sr.txt)

**New since the 2013 list.**

### Parallel-In Serial-Out

Circuit file: [`piso-sr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/piso-sr.txt)

**New since the 2013 list.**

### Universal

Circuit file: [`unishiftreg.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/unishiftreg.txt)

**New since the 2013 list.**

## Sequential Logic: TD4 CPU

This category is new since the 2013 list.

### TD4 LED Strobe

Circuit file: [`td4.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/td4.txt)

**New since the 2013 list.**

### TD4 Counter

Circuit file: [`td4-ctr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/td4-ctr.txt)

**New since the 2013 list.**

### TD4 Down Counter

Circuit file: [`td4-ctr-dn.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/td4-ctr-dn.txt)

**New since the 2013 list.**

### TD4 Up-Down Counter

Circuit file: [`td4-ctr-up-dn.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/td4-ctr-up-dn.txt)

**New since the 2013 list.**

### TD4 Add 2

Circuit file: [`td4-add2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/td4-add2.txt)

**New since the 2013 list.**

## Analog/Digital

1 of the 8 circuit is new since the 2013 list.

### Flash ADC

Circuit file: [`flashadc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/flashadc.txt)

### Delta-Sigma ADC

Circuit file: [`deltasigma.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/deltasigma.txt)

### Half-Flash (Subranging) ADC

Circuit file: [`hfadc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/hfadc.txt)

### Binary-Weighted DAC

Circuit file: [`dac.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/dac.txt)

### R-2R Ladder DAC

Circuit file: [`r2rladder.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/r2rladder.txt)

### Switch-Tree DAC

Circuit file: [`swtreedac.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/swtreedac.txt)

### Digital Sine Wave

Circuit file: [`digsine.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/digsine.txt)

### QAM-256 Modulator/Demodulator

Circuit file: [`qam-256.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/qam-256.txt)

**New since the 2013 list.**

## Power Converters

This category is new since the 2013 list.

### Boost Converter

Circuit file: [`conv-boost.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/conv-boost.txt)

**New since the 2013 list.**

### Buck Converter

Circuit file: [`conv-buck.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/conv-buck.txt)

**New since the 2013 list.**

### Buck-Boost Converter

Circuit file: [`conv-buckboost.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/conv-buckboost.txt)

**New since the 2013 list.**

### Ćuk Converter

Circuit file: [`conv-cuk.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/conv-cuk.txt)

**New since the 2013 list.**

### SEPIC Converter

Circuit file: [`conv-sepic.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/conv-sepic.txt)

**New since the 2013 list.**

## Phase-Locked Loops

### XOR Phase Detector

Circuit file: [`xorphasedet.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/xorphasedet.txt)

### Type I PLL

Circuit file: [`pll.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pll.txt)

### Phase Comparator (Type II)

Circuit file: [`phasecomp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/phasecomp.txt)

### Phase Comparator Internals

Circuit file: [`phasecompint.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/phasecompint.txt)

### Type II PLL

Circuit file: [`pll2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pll2.txt)

### Type II PLL (fast)

Circuit file: [`pll2a.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/pll2a.txt)

### Frequency Doubler

Circuit file: [`freqdouble.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/freqdouble.txt)

## Transmission Lines

### Simple TL

Circuit file: [`tl.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tl.txt)

### Standing Wave

Circuit file: [`tlstand.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tlstand.txt)

### Termination

Circuit file: [`tlterm.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tlterm.txt)

### Mismatched lines (Pulse)

Circuit file: [`tlmismatch.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tlmismatch.txt)

### Mismatched lines (Standing Wave)

Circuit file: [`tlmis1.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tlmis1.txt)

### Impedance Matching (L-Section)

Circuit file: [`tlmatch1.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tlmatch1.txt)

### Impedance Matching (Shunt Stub)

Circuit file: [`tlmatch2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tlmatch2.txt)

### Stub Frequency Response

Circuit file: [`tlfreq.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tlfreq.txt)

### Low-Pass Filter

Circuit file: [`tllopass.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tllopass.txt)

### Light Switch

Circuit file: [`tllight.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tllight.txt)

## Controlled Sources

This category is new since the 2013 list.

### VCCS Resistor

Circuit file: [`cs-resistor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-resistor.txt)

**New since the 2013 list.**

### VCCS Varying Resistor

Circuit file: [`cs-varyresistor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-varyresistor.txt)

**New since the 2013 list.**

### VCVS Op-Amp

Circuit file: [`cs-opamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-opamp.txt)

**New since the 2013 list.**

### VCVS Op-Amp With Rails

Circuit file: [`cs-opamprail.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-opamprail.txt)

**New since the 2013 list.**

### VCVS Multiplier

Circuit file: [`cs-multiplier.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-multiplier.txt)

**New since the 2013 list.**

### VCVS Full Rectifier

Circuit file: [`cs-fullrectifier.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-fullrectifier.txt)

**New since the 2013 list.**

### VCVS Voltage Ramp

Circuit file: [`cs-ramp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-ramp.txt)

**New since the 2013 list.**

### Current Adder

Circuit file: [`cs-currentadder.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-currentadder.txt)

**New since the 2013 list.**

### VCVS Integrator

Circuit file: [`cs-integrator.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-integrator.txt)

**New since the 2013 list.**

### VCVS Differentiator

Circuit file: [`cs-diff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-diff.txt)

**New since the 2013 list.**

### CCVS Variable Inductor

Circuit file: [`cs-varinduct.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-varinduct.txt)

**New since the 2013 list.**

### VCCS Variable Capacitor

Circuit file: [`cs-varicap.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cs-varicap.txt)

**New since the 2013 list.**

## Subcircuits

This category is new since the 2013 list.

### Full Rectifier

Circuit file: [`fullrect-sc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/fullrect-sc.txt)

**New since the 2013 list.**

### Full Adder (nested)

Circuit file: [`adder4-sc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/adder4-sc.txt)

**New since the 2013 list.**

## Misc Devices

All 6 circuits here are new since the 2013 list.

### LED Array

Circuit file: [`ledarray.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ledarray.txt)

**New since the 2013 list.**

### DIAC/TRIAC Dimmer

Circuit file: [`triacdimmer.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/triacdimmer.txt)

**New since the 2013 list.**

### Unijunction Oscillator

Circuit file: [`ujtosc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ujtosc.txt)

**New since the 2013 list.**

### 3-Phase Motor

Circuit file: [`3motor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/3motor.txt)

**New since the 2013 list.**

### Latching Relay

Circuit file: [`latchingrelay.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/latchingrelay.txt)

**New since the 2013 list.**

### Gyrator

Circuit file: [`gyratorelm.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/gyratorelm.txt)

**New since the 2013 list.**

## Misc Devices: JFETs

2 of the 7 circuits are new since the 2013 list.

### JFET Current Source

Circuit file: [`jfetcurrentsrc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/jfetcurrentsrc.txt)

### JFET Follower

Circuit file: [`jfetfollower.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/jfetfollower.txt)

### JFET Follower w/zero offset

Circuit file: [`jfetfollower-nooff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/jfetfollower-nooff.txt)

### Common-Source Amplifier

Circuit file: [`jfetamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/jfetamp.txt)

### Volume Control

Circuit file: [`volume.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/volume.txt)

### Lambda Diode

Circuit file: [`lambda-diode.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/lambda-diode.txt)

**New since the 2013 list.**

### Lambda Diode Oscillator

Circuit file: [`lambda-diode-osc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/lambda-diode-osc.txt)

**New since the 2013 list.**

## Misc Devices: Tunnel Diodes

### I/V Curve

Circuit file: [`tdiode.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tdiode.txt)

### LC Oscillator

Circuit file: [`tdosc.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tdosc.txt)

### Relaxation Oscillator

Circuit file: [`tdrelax.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tdrelax.txt)

## Misc Devices: Memristors

### Memristor

Circuit file: [`mr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mr.txt)

### Sine Wave

Circuit file: [`mr-sine.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mr-sine.txt)

### Square Wave

Circuit file: [`mr-square.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mr-square.txt)

### Triangle Wave

Circuit file: [`mr-triangle.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mr-triangle.txt)

### Hard-Switching 1

Circuit file: [`mr-sine2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mr-sine2.txt)

### Hard-Switching 2

Circuit file: [`mr-sine3.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mr-sine3.txt)

### Crossbar Memory

Circuit file: [`mr-crossbar.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/mr-crossbar.txt)

## Misc Devices: Triodes

### Triode

Circuit file: [`triode.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/triode.txt)

### Amplifier

Circuit file: [`triodeamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/triodeamp.txt)

## Misc Devices: Silicon-Controlled Rectifiers

### SCR

Circuit file: [`scr.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/scr.txt)

### AC Trigger

Circuit file: [`scractrig.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/scractrig.txt)

## Misc Devices: Current Conveyor

### CCII+

Circuit file: [`cc2.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cc2.txt)

### CCII-

Circuit file: [`cc2n.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cc2n.txt)

### Inductor Simulator

Circuit file: [`ccinductor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ccinductor.txt)

### CCII+ Implementation

Circuit file: [`cc2imp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cc2imp.txt)

### CCII- Implementation

Circuit file: [`cc2impn.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cc2impn.txt)

### Current Amplifier

Circuit file: [`cciamp.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/cciamp.txt)

### VCCS

Circuit file: [`ccvccs.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ccvccs.txt)

### Current Differentiator

Circuit file: [`ccdiff.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ccdiff.txt)

### Current Integrator

Circuit file: [`ccint.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ccint.txt)

### Current-Controlled Voltage Source

Circuit file: [`ccitov.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ccitov.txt)

## Misc Devices: Spark Gap

### Sawtooth Generator

Circuit file: [`spark-sawtooth.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/spark-sawtooth.txt)

### Tesla Coil

Circuit file: [`tesla.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/tesla.txt)

### Marx Generator

Circuit file: [`spark-marx.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/spark-marx.txt)

## Misc Devices: Operational Transconductance Amplifier (OTA)

This category is new since the 2013 list.

### OTA Voltage Controlled Amplifier (VCA)

Circuit file: [`ota-vca.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ota-vca.txt)

**New since the 2013 list.**

### OTA Single Stage VCF (low pass)

Circuit file: [`ota-vcf-single.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ota-vcf-single.txt)

**New since the 2013 list.**

### OTA Ring Modulator

Circuit file: [`ota-ringmod.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ota-ringmod.txt)

**New since the 2013 list.**

### LM137000 Gain Oddity

Circuit file: [`ota-gain.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/ota-gain.txt)

**New since the 2013 list.**

## Misc Devices: Light Bulb

This category is new since the 2013 list.

### Light Bulb

Circuit file: [`lightbulb.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/lightbulb.txt)

**New since the 2013 list.**

### Wien Bridge Oscillator

Circuit file: [`wienbridge.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/wienbridge.txt)

**New since the 2013 list.**

## Misc Devices: Varactor

This category is new since the 2013 list.

### Varactor

Circuit file: [`varactor.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/varactor.txt)

**New since the 2013 list.**

### VCO

Circuit file: [`varactorvco.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/varactorvco.txt)

**New since the 2013 list.**

## Misc Devices: Norton Amplifier

This category is new since the 2013 list.

### Norton Inverting Amplifier

Circuit file: [`norton-invert.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/norton-invert.txt)

**New since the 2013 list.**

### Norton Noninverting Amplifier

Circuit file: [`norton-noninvert.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/norton-noninvert.txt)

**New since the 2013 list.**

### Norton Sawtooth Oscillator

Circuit file: [`norton-saw.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/norton-saw.txt)

**New since the 2013 list.**

## 2-D Scope

This category is new since the 2013 list.

### Lissajous Figures

Circuit file: [`lissa.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/lissa.txt)

In the 2013 list this was under **Other Passive Circuits**.

### Checkerboard

Circuit file: [`plot2d-checker.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/plot2d-checker.txt)

**New since the 2013 list.**

### Color Checkerboard

Circuit file: [`plot2d-color.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/plot2d-color.txt)

**New since the 2013 list.**

### Smiley

Circuit file: [`plot2d-smile.txt`](https://github.com/pfalstad/circuitjs1/blob/master/src/com/lushprojects/circuitjs1/public/circuits/plot2d-smile.txt)

**New since the 2013 list.**

## Credits

The circuit simulator and most of its example circuits were created by [Paul Falstad](https://www.falstad.com/circuit/). Iain Sharp ported it from a Java applet to the browser as [CircuitJS1](https://github.com/sharpie7/circuitjs1). Rodrigo Hausen made the [hausen/circuit-simulator](https://github.com/hausen/circuit-simulator) fork that this page's 2013 list came from; the CircuitJS1 README credits him for file import/export and many interface improvements. The same README thanks many other contributors, including Felthry for many example circuits and Julius Schmidt for the spark gap examples.

CircuitJS1 is free software under the [GNU General Public License, version 2 or later](https://github.com/pfalstad/circuitjs1/blob/master/README.md#license). The hausen fork follows Falstad's [licensing terms](https://www.falstad.com/licensing.html) for the original Java version.
