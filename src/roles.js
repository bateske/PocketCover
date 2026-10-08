// Engine-19 palette roles, fixed lightness look-up tables and subject-layer
// markers (engine-contract 1.3). Data only: no module imports this file's
// tables to choose colours, only to name and step between roles.
//
//   0 1 2 3  background ramp (dark to light: 4 -> 0 -> 1 -> 3 -> 2 -> 9)
//   4        ink #000000 (fixed)      5 6 7  main material shadow/body/light
//   8        cream #FFF4D6 (fixed)    9      background light / muted metal
//   10 11    accent and accent shade (shared with the title, rationed)
//   12       TITLE ONLY               13 grey #808080 (fixed)   14 red #D62020 (fixed)
//
// There is no rainbow role: CHGame's animated slot (#FF00FF) is never emitted.
export const ROLE=Object.freeze({BG0:0,BG1:1,BG2:2,BG3:3,INK:4,M0:5,M1:6,M2:7,CREAM:8,BG9:9,A0:10,A1:11,T:12,GREY:13,RED:14});

/** The only roles scenes (renderBackground) may paint. */
export const BACKGROUND_ROLES=Object.freeze([0,1,2,3,9]);

// One step darker or lighter along each role chain, indexed by role 0..14.
// Chains, dark to light: background 4 -> 0 -> 1 -> 3 -> 2 -> 9; main
// 4 -> 5 -> 6 -> 7 -> 8 (cream); accent and title 5 -> 11 -> 10 -> 12;
// red 11 -> 14; grey 4 -> 13. palette.js guarantees strictly increasing OKLab
// L along every chain, in every mood (tests/palette-v2.test.js).
// LIGHTER never produces 12 or cream from another role (LIGHTER[10]=10,
// LIGHTER[7]=7); 8 and 12 map to themselves. Grey darkens to black
// (DARKER[13]=4, as CHGame's ramps do): the engine-contract draft's 13 -> 9
// cannot hold lightness order in dusk (9 is a warm horizon glow at L .62) or
// pastel (9 at L .91), both above grey's L .60. Typed arrays cannot be
// frozen: treat both as read-only.
//                               idx: 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14
export const DARKER =Uint8Array.of(4,0,3,1,4,4,5,6,7,2,11, 5,10, 4,11);
export const LIGHTER=Uint8Array.of(1,3,9,2,0,6,7,7,8,9,10,10,12,13,14);

// Subject-layer markers ("darken what is underneath"), resolved by the engine
// composite through DARKER (once for DARKEN1, twice for DARKEN2). TRANSPARENT
// stays 255 in quality.js.
export const DARKEN1=254,DARKEN2=253;
