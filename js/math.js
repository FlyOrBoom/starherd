// Math
const random_range = (a, b) => a + (b - a) * Math.random()
const in_range = (a, x, b) => (a <= x) && (x <= b)
const to_01 = (a,b) => x => (x-a)/(b-a)
const to_11 = (a,b) => x => to_01(a,b)(x)*2-1
const ln = (x) => Math.log(x)
const log10 = (x) => ln(x)/ln(10.0)
const exp = (x) => Math.exp(x)
const exp10 = (x) => Math.pow(10, x)
const abs = (x) => Math.abs(x)
const max = (a,b) => Math.max(a,b)
const min = (a,b) => Math.min(a,b)
const clamp = (a,x,b) => min(max(x,a),b)
const mix = (a,b) => (x) => a*(1-x) + b*x
const round = (x) => Math.round(x)
const lerp = (x) => (x0, x1) => (v0, v1) =>
  (x < x0) ? v0 : (x > x1) ? v1 : mix(v0, v1)((x-x0)/(x1-x0))
const check = (x, ...obj) => isFinite(x) || console.error("check:", x, ...obj)

const sqrt = (x) => Math.sqrt(x)
const cbrt = (x) => Math.cbrt(x)
const norm = (u, v) => sqrt(u.reduce((sum, _, i) => (sum + (u[i] - v[i])*(u[i] - v[i])), 0))
const int_range = (n) => Array(n).fill(0).map((_, i) => i)
const from_interval = (interval, value) => 
  interval[Object.keys(interval).find(k => parseInt(k) > value)]

const rgb_a = (rgb, a) => "rgb(" + rgb.join(",") + "," + a + ")"

const quad = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
])

// Constants
const PI = Math.PI
const STEFAN = 5.670374419e-8
const L_sun = 3.86e+26 // watts
const R_sun = 6.9634e+8 // meters
const Z_sun = 0.02
const M_chandra = 1.44 // chandrasekhar limit


const classes = {
  2400: "M",
  3700: "K",
  5200: "G",
  6000: "F",
  7500: "A",
  10000: "B",
  30000: "O",
}

// Conversions
const abs_mag_to_sol_lum = (M) => 
  Math.pow(100, -M/5)
  
const bv_to_temp = (i) => 
  4600 * (1/(0.92*i + 1.7) + 1/(0.92*i + 0.62))
  
const radius_lum_to_temp = (R, L) => 
  ( L*L_sun / ((4*PI*R*R*R_sun*R_sun) * STEFAN) ) ** (1/4)
  
// https://sciencedemos.org.uk/color_blackbody.php
const temp_to_rgb = (T) => {
  const red = (T < 6600) ? 255 
  : 329.698727446 * ((T/100 - 60) ** (-0.1332047592))
  const green = (T < 6600) ? 99.4708025861 * ln(T/100) - 161.1195681661
  : 288.1221695283 * ((T/100 - 60) ** -0.0755148492)
  const blue = (T > 6600) ? 255
  : (T < 1900) ? 0
  : 138.5177312231 * ln(T/100 - 10) - 305.0447927307
  return [red, green, blue].map(c => clamp(0, c/255, 1))
}

let min_bv = +3, max_bv = -0.5
let min_temp = bv_to_temp(min_bv), max_temp = bv_to_temp(max_bv)
let min_mag = +10, max_mag = -20
let min_sol_lum = abs_mag_to_sol_lum(min_mag), max_sol_lum = abs_mag_to_sol_lum(max_mag)

let min_mass = 0.05, max_mass = 20
let min_metal = 0.01, max_metal = 0.03

const n_stars = 32
const stars = []

