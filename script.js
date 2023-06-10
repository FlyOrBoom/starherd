import * as twgl from "./dist/twgl-full.module.js"
const m4 = twgl.m4
const v3 = twgl.v3

const canvas = document.getElementById("canvas")
const axes = document.getElementById("axes")
const gl = canvas.getContext("webgl2")

/*
const backgrounds = [1,2,3].map(n => {
  const img = new Image()
  img.src = "backgrounds/" + n + ".png"
  return img
})
*/

let vw, vh, vmin, vmax

// Math
const random_range = (a, b) => a + (b - a) * Math.random()
const in_range = (a, x, b) => (a <= x) && (x <= b)
const to_01 = (a,b) => x => (x-a)/(b-a)
const to_11 = x => x*2-1
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
const int_range = (n) => Array(n).fill(0).map((_, i) => i)
const from_interval = (interval, value) => 
  interval[Object.keys(interval).find(k => parseInt(k) > value)]

const rgb_a = (rgb, a) => "rgb(" + rgb.join(",") + "," + a + ")"

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
// Probability density function of stars' initial masses
// Kroupa 2001
const initial_mass_function = M => (
  (M < 0.08) ? (M ** -0.3)
  : in_range (0.08, M, 0.5) ? (M ** -1.3)
  : (M ** -2.3)
)

// Zeta function of metallicity Z
const phases = {
  C_MS: { name: "Main sequence below 0.7 M", index: 0, },
  MS: { name: "Main sequence above 0.7 M", index: 1, },
  HG: { name: "Hertzsprung Gap", index: 2, },
  GB: { name: "First Giant Branch", index: 3, },
  CHeB: { name: "Core Helium Burning", index: 4, },
  EAGB: { 
    index: 5, 
    name: "Early Asymptotic Giant Branch", 
    description: "Extinct H-burning shell surrounding an H-exhausted core, where degenerate CO is beginning to grow."
  },
  TAPGB: { name: "Thermally Pulsating Asymptotic Giant Branch", index: 6, },
  // He_MS: { name: "Naked Helium Star Main Sequence", index: 7, },
  // He_HG: { name: "Naked Helium Star Hertzsprung Gap", index: 8, },
  // He_GB: { name: "Naked Helium Star Giant Branch", index: 9, },
  // He_WD: { name: "Helium White Dwarf", index: 10, },
  CO_WD: { name: "Carbon/Oxygen White Dwarf", index: 11, },
  ONe_WD: { name: "Oxygen/Neon White Dwarf", index: 12, },
  NS: { name: "Neutron Star", index: 13, },
  BH: { name: "Black Hole", index: 14, },
  R: { name: "massless remnant", index: 15, },
}

const regimes = {
  LM: { name: "Low mass", index: 0, },
  IM: { name: "Intermediate mass", index: 1, },
  HM: { name: "High mass", index: 2, },
}

const polynomial = x => coefficients => 
  coefficients.reduce((sum, coefficient, degree) => 
    sum + coefficient * (x**degree)
  , 0)

const rational = x => (...pairs) =>
  pairs.reduce((sum, [coefficient, exponent]) => 
    sum + coefficient * (x ** exponent)
  , 0)

const fit = x => (...numerator) => (...denominator) =>
  rational(x)(...numerator) / rational(x)(...denominator)

const from_coefficients = x => (...coefficients) =>
  coefficients.map(polynomial(x))

let min_bv = +3, max_bv = -0.5
let min_temp = bv_to_temp(min_bv), max_temp = bv_to_temp(max_bv)
let min_mag = +10, max_mag = -20
let min_sol_lum = abs_mag_to_sol_lum(min_mag), max_sol_lum = abs_mag_to_sol_lum(max_mag)

let min_mass = 0.05, max_mass = 20
let min_metal = 0.01, max_metal = 0.03

const n_stars = 100

const display = true

const bubble_config = {
  count: 7,
  rmin: 5,
  rmax: 15,
  min: 0,
  max: 100
}

const stars = {}

const star_init = (id, M, Z) => {
  
  const $ = { 
    id, 
    M: { ZAMS: M }, // mass
    Mc: { }, // core mass
    
    X: 0.76 - 3*Z, // hydrogen abunance (T p.1)
    Y: 0.24 + 2*Z, // helium abundance (T p.1)
    Z: Z, // metallicity (T p.1)
    σ: log10(Z), // log metallicity (H Appendix)
    ζ: log10(Z/Z_sun), // relative log metallicity (H Appendix)
    ρ: log10(Z/Z_sun) + 1.0,
    
    L: { }, // luminosity
    R: { }, // radius
    T: { }, // temperature
    t: { }, // time
    τ: { }, // relative time
    _: { }, // misc
  }
  
  $.polynomial = polynomial($.ζ)
  $.from_coefficients = from_coefficients($.ζ)

  // (H1, H2, H3)
  // Constant stuff
  {
    // (H1)
    // the initial mass above which a hook appears in the main-sequence
    $.M.hook = 1.0185 + 0.16015*$.ζ + 0.0892*$.ζ*$.ζ

    // (H2)
    // the maximum initial mass for which He ignites degenerately in a helium flash
    $.M.HeF = 1.995 + 0.25*$.ζ + 0.087*$.ζ*$.ζ

    // (H3)
    // the maximum initial mass for which He ignites on the first giant branch
    $.M.FGB = 13.048 * ((Z/0.02)**0.06) / (1 + 0.0012*((0.02/Z)**1.27))

    // (H p.5)
    $.regimes = ({ LM, IM, HM, LM_IM, IM_HM }) => 
      (M < $.M.HeF) ? (LM ?? LM_IM)
      : in_range($.M.HeF, M, $.M.FGB) ? (IM ?? LM_IM ?? IM_HM)
      : (HM ?? IM_HM)

    // where the mass of the convective envelope MCE first exceeds a set fraction of the envelope mass ME
    $.ratio_CE_E = $.regimes({ LM: 2/5, IM_HM: 1/3 })
  }
  check($.M.hook)
  check($.M.HeF)
  check($.M.FGB)
  check($.ratio_CE_E)
  
  // (H p.10)
  // rate of hydrogen fusion
  const A_H = exp10(
    max(-4.8, min(-5.7 + 0.8*M, -4.1 + 0.14*M))
  )
  
  // (H p.13)
  // rate of helium fusion
  const A_He = 7.66e-5
  
  // combined rate
  const A_H_He = (A_H * A_He) / (A_H + A_He)
  
  // BEGIN COEFFICIENTS

  // (T p.2)
  
  const [ aα, aβ, aγ, aδ, aε, aζ, aη ] = $.from_coefficients(
    [ 0.3970417, -0.32913574, 0.34776688, 0.37470851, 0.09011915 ],
    [ 8.527626, -24.41225973, 56.43597107, 37.06152575, 5.4562406 ],
    [ 0.00025546, -0.00123461, -0.00023246, 0.00045519, 0.00016176 ],
    [ 5.432889, -8.62157806, 13.44202049, 14.51584135, 3.39793084 ],
    [ 5.563579, -10.32345224, 19.4432298, 18.97361347, 4.16903097 ],
    [ 0.7886606, -2.90870942, 6.54713531, 4.05606657, 0.53287322 ],
    [ 0.00586685, -0.01704237, 0.03872348, 0.02570041, 0.00383376 ]
  )
  
  const [ aθ, aι, aκ, aλ, aμ, aν, aξ, aο, aπ ] = $.from_coefficients(
    [ 1.715359, 0.62246212, -0.92557761, -1.16996966, -0.30631491 ], 
    [ 6.597788, -0.42450044, -12.13339427, -10.73509484, -2.51487077 ],
    [ 10.08855, -7.11727086, -31.67119479, -24.24848322, -5.33608972 ],
    [ 1.012495, 0.3269969, -0.00923418, -0.03876858, -0.0041275 ],
    [ 0.07490166, 0.02410413, 0.07233664, 0.03040467, 0.00197741 ],
    [ 0.01077422, 0, 0, 0, 0 ],
    [ 3.082234, 0.9447205, -2.15200882, -2.49219496, -0.63848738 ],
    [ 17.84778, -7.4534569, -48.96066856, -40.05386135, -9.09331816 ],
    [ 0.00022582, -0.00186899, 0.00388783, 0.00142402, -0.00007671 ]
  ) 
  
    
  // (H p.24)
  
  const [ a1, a2, a3, a4, a5 ] = $.from_coefficients(
    [1.593890e+3, 2.053038e+3, 1.231226e+3, 2.327785e+2],
    [2.706708e+3, 1.483131e+3, 5.772723e+2, 7.411230e+1],
    [1.466143e+2, -1.048442e+2, -6.795374e+1, -1.391127e+1],
    [4.141960e-2, 4.564888e-2, 2.958542e-2, 5.571483e-3],
    [3.426349e-1]
  )

  const [ a6, a7, a8, a9, a10 ] = $.from_coefficients(
    [1.949814e+1, 1.758178e+0, -6.008212e+0, -4.470533e+0],
    [4.903830e+0],
    [5.212154e-2, 3.166411e-2, -2.750074e-3, -2.271549e-3],
    [1.312179e+0, -3.294936e-1, 9.231860e-2, 2.610989e-2],
    [8.073972e-1]
  )
  
  const [ _a11, _a12, a13, a14, a15, a16 ] = $.from_coefficients(
    [1.031538e+0, -2.434480e-1, 7.732821e+0, 6.460705e+0, 1.374484e+0],
    [1.043715e+0, -1.577474e+0, -5.168234e+0, -5.596506e+0, -1.299394e+0],
    [7.859573e+2, -8.542048e+0, -2.642511e+1, -9.585707e+0],
    [3.858911e+3, 2.459681e+3, -7.630093e+1, -3.486057e+2, -4.861703e+1],
    [2.888720e+2, 2.952979e+2, 1.850341e+2, 3.797254e+1],
    [7.196580e0, 5.613746e-1, 3.805871e-1, 8.398728e-2],
  )
  const a11 = _a11 * a14
  const a12 = _a12 * a14

  const [ _a18, _a19, a20, a21, a22, a23, a24, a25, a26 ] = $.from_coefficients(
    [2.187715e-1, -2.154437e+0, -3.768678e+0, -1.975518e+0, -3.021475e-1],
    [1.466440e+0, 1.839725e+0, 6.442199e+0, 4.023635e+0, 6.957529e-1],
    [2.652091e+1, 8.178458e+1, 1.156058e+2, 7.633811e+1, 1.950698e+1],
    [1.472103e+0, -2.947609e+0, -3.312828e+0, -9.945065e-1],
    [3.071048e+0, -5.679941e+0, -9.745523e+0, -3.594543e+0],
    [2.617890e+0, 1.019135e+0, -3.292551e-2, -7.445123e-2],
    [1.075567e-2, 1.773287e-2, 9.610479e-3, 1.732469e-3],
    [1.476246e+0, 1.899331e+0, 1.195010e+0, 3.035051e-1],
    [5.502535e+0, -6.601663e-2, 9.968707e-2, 3.599801e-2],
  )
  const a17 = exp10(max(0.097 - 0.1072*($.σ + 3), max(0.097, min(0.1461, 0.1461 + 0.1237*($.σ + 2)))))
  const a18 = _a18 * a20
  const a19 = _a19 * a20

// (H p.25)

  const [ a27, a28, _a29, a30, a31, a32 ] = $.from_coefficients(
    [9.511033e+1, 6.819618e+1, -1.045625e+1, -1.474939e+1],
    [3.113458e+1, 1.012033e+1, -4.650511e+0, -2.463185e+0],
    [1.413057e+0, 4.578814e-1, -6.850581e-2, -5.588658e-2],
    [3.910862e+1, 5.196646e+1, 2.264970e+1, 2.873680e+0],
    [4.597479e+0, -2.855179e-1, 2.709724e-1],
    [6.682518e+0, 2.827718e-1, -7.294429e-2],
  )
  const a29 = _a29 ** a32
  
  const [ a34, a35, a36, a37 ] = $.from_coefficients(
    [1.910302e-1, 1.158624e-1, 3.348990e-2, 2.599706e-3],
    [3.931056e-1, 7.277637e-2, -1.366593e-1, -4.508946e-2],
    [3.267776e-1, 1.204424e-1, 9.988332e-2, 2.455361e-2],
    [5.990212e-1, 5.570264e-2, 6.207626e-2, 1.777283e-2],
  )
  const _a33 = min(1.4, 1.5135 + 0.3769 * $.ζ)
  const a33 = max(0.6355 - 0.4192 * $.ζ, max(1.25, _a33))

  const [ a38, a39, a40, a41, _a42, a43, _a44 ] = $.from_coefficients(
    [7.330122e-1, 5.192827e-1, 2.316416e-1, 8.346941e-3],
    [1.172768e+0, -1.209262e-1, -1.193023e-1, -2.859837e-2],
    [3.982622e-1, -2.296279e-1, -2.262539e-1, -5.219837e-2],
    [3.571038e+0, -2.223625e-2, -2.611794e-2, -6.359648e-3],
    [1.9848e+0, 1.1386e+0, 3.5640e-1],
    [6.300e-2, 4.810e-2, 9.840e-3],
    [1.200e+0, 2.450e+0],
  )
  const a42 = min(1.25, max(1.1, _a42))
  const a44 = min(1.3, max(0.45, _a44))
  
  const [ a45, a46, a47, a48, _a49, _a50, _a51, _a52, _a53 ] = $.from_coefficients(
    [2.321400e-1, 1.828075e-3, -2.232007e-2, -3.378734e-3],
    [1.163659e-2, 3.427682e-3, 1.421393e-3, -3.710666e-3],
    [1.048020e-2, -1.231921e-2, -1.686860e-2, -4.234354e-3],
    [1.555590e+0, -3.223927e-1, -5.197429e-1, -1.066441e-1],
    [9.7700e-2, -2.3100e-1, -7.5300e-2],
    [2.4000e-1, 1.8000e-1, 5.9500e-1],
    [3.3000e-1, 1.3200e-1, 2.1800e-1],
    [1.1064e+0, 4.1500e-1, 1.8000e-1],
    [1.1900e+0, 3.7700e-1, 1.7600e-1],
  )
  const a49 = max(_a49, 0.145)
  const a50 = min(_a50, 0.306 + 0.053 * $.ζ)
  const a51 = min(_a51, 0.3625 + 0.062 * $.ζ)
  const a52 = (Z > 0.01) ? clamp(0.9, _a52, 1.0) : max(_a52, 0.9)
  const a53 = (Z > 0.01) ? clamp(1.0, _a53, 1.1) : max(_a53, 1.0)

  // (H p.26)
  
  const [ a54, a55, a56, _a57 ] = $.from_coefficients(
    [3.855707e-1, -6.104166e-1, 5.676742e+0, 1.060894e+1, 5.284014e+0],
    [3.579064e-1, -6.442936e-1, 5.494644e+0, 1.054952e+1, 5.280991e+0],
    [9.587587e-1, 8.777464e-1, 2.017321e-1],
    [1.5135e+0, 3.7690e-1]
  )
  const a57 = max(0.6355 - 0.4192*$.ζ, clamp(1.25, _a57, 1.4))

  const [ a58, a59, a60, a61, _a62, _a63, __a64, a65, __a66, a67, __a68 ] = $.from_coefficients(
    [4.907546e-1, -1.683928e-1, -3.108742e-1, -7.202918e-2],
    [4.537070e+0, -4.465455e+0, -1.612690e+0, -1.623246e+0],
    [1.796220e+0, 2.814020e-1, 1.423325e+0, 3.421036e-1],
    [2.256216e+0, 3.773400e-1, 1.537867e+0, 4.396373e-1],
    [8.4300e-2, -4.7500e-2, -3.5200e-2],
    [7.3600e-2, 7.4900e-2, 4.4260e-2],
    [1.3600e-1, 3.5200e-2],
    [1.564231e-3, 1.653042e-3, -4.439786e-3, -4.951011e-3, -1.216530e-3],
    [1.4770e+0, 2.9600e-1],
    [5.210157e+0, -4.143695e+0, -2.120870e+0],
    [1.1160e+0, 1.6600e-1],
  )
  const a62 = max(0.065, _a62)
  const a63 = (Z < 0.004) ? min(0.055, _a63) : _a63
  const _a64 = clamp(0.091, __a64, 0.121)
  const _a66 = max(__a66, min(1.6, 0.308 - 1.046 * $.ζ))
  const a66 = clamp(0.8, _a66, 0.8 - 2.0*$.ζ)
  const _a68 = max(0.9, min(__a68, 1.0))
  const a68 = min(_a68, a66)
  
  const [ a69, a70, a71, _a72, a73, _a74 ] = $.from_coefficients(
    [1.071489e+0, -1.164852e-1, -8.623831e-2, -1.582349e-2],
    [7.108492e-1, 7.935927e-1, 3.926983e-1, 3.622146e-2],
    [3.478514e+0, -2.585474e-2, -1.512955e-2, -2.833691e-3],
    [9.132108e-1, -1.653695e-1, 3.636784e-2],
    [3.969331e-3, 4.539076e-3, 1.720906e-3, 1.897857e-4],
    [1.600e+0, 7.640e-1, 3.322e-1]
  )
  const a72 = (Z>0.01) ? max(_a72, 0.95) : _a72
  const a74 = clamp(1.4, _a74, 1.6)
    
  // (H p.27)
  
  const [ _a75, _a76, _a77, _a78, _a79, _a80, _a81 ] = $.from_coefficients(
    [8.109e-1, -6.282e-1],
    [1.192334e-2, 1.083057e-2, 1.230969e+0, 1.551656e+0],
    [-1.668868e-1, 5.818123e-1, -1.105027e+1, -1.668070e+1],
    [7.615495e-1, 1.068243e-1, -2.011333e-1, -9.371415e-2],
    [9.409838e+0, 1.522928e+0],
    [-2.7110e-1, -5.7560e-1, -8.3800e-2],
    [2.4930e+0, 1.1475e+0]
  )
  const a75 = max(clamp(1.0, _a75, 0.6355 - 0.4192*$.ζ), 1.27)
  const a76 = max(_a76, -0.1015564 - 0.2161264*$.ζ - 0.05182516*$.ζ*$.ζ)
  const a77 = clamp(-0.3868776 - 0.5457078*$.ζ - 0.146347*$.ζ*$.ζ, _a77, 0.0)
  const a78 = clamp(0.0, _a78, 7.454 + 9.046*$.ζ)
  const a79 = clamp(2.0, -13.3 - 18.6*$.ζ, _a79)
  const a80 = max(0.0585542, _a80)
  const a81 = clamp(0.4, _a81, 1.5)

  const [ _b1, _b4, b5, _b6, b7 ] = $.from_coefficients(
    [3.9700e-1, 2.8826e-1, 5.2930e-1],
    [9.960283e-1, 8.164393e-1, 2.383830e+0, 2.223436e+0, 8.638115e-1],
    [2.561062e-1, 7.072646e-2, -5.444596e-2, -5.798167e-2, -1.349129e-2],
    [1.157338e+0, 1.467883e+0, 4.299661e+0, 3.130500e+0, 6.992080e-1],
    [4.022765e-1, 3.050010e-1, 9.962137e-1, 7.914079e-1, 1.728098e-1]
  )
  const b1 = min(0.54, _b1)
  const b2 = clamp(-0.04167 + 55.67*Z, exp10(-4.6739 - 0.9394*$.σ), 0.4771 - 9329.21*(Z**2.94))
  const _b3 = exp10(max(-0.1451, -2.2794 - 1.5175*$.σ - 0.254*$.σ*$.σ))
  const b3 = (Z > 0.004) ? max(_b3, 0.7307 + 14265.1 * (Z**3.395)) : _b3
  const b4 = _b4 + 0.1231572 * ($.ζ**5)
  const b6 = _b6 + 0.01640687 * ($.ζ**5)
  
  const b8 = NaN

  const [ b9, b10, _b11, b12, _b13 ] = $.from_coefficients(
    [2.751631e+3, 3.557098e+2],
    [-3.820831e-2, 5.872664e-2],
    [1.071738e+2, -8.970339e+1, -3.949739e+1],
    [7.348793e+2, -1.531020e+2, -3.793700e+1],
    [9.219293e+0, -2.005865e+0, -5.561309]
  )
  const b11 = _b11*_b11
  const b13 = _b13*_b13
  
  const [ _b14, b15, _b16 ] = $.from_coefficients(
    [2.917412e+0, 1.575290e+0, 5.751814e-1],
    [3.629118e+0, -9.112722e-1, 1.042291e+0],
    [4.916389e+0, 2.862149e+0, 7.84485]
  )
  const b14 = _b14**b15
  const b16 = _b16**b15
  const b17 = ($.ζ > -1.0) ? (1.0 - 0.3880523 * (($.ζ + 1.0)**2.862149)) : 1.0
  
  // (H p.28)
  
  const [ b18, b19, b20, b21, b22, b23 ] = $.from_coefficients(
    [5.496045e+1, -1.289968e+1, 6.385758e+0],
    [1.832694e+0, -5.766608e-2, 5.696128e-2],
    [1.211104e+2],
    [2.214088e+2, 2.187113e+2, 1.170177e+1, -2.635340e+1],
    [2.063983e+0, 7.363827e-1, 2.654323e-1, -6.140719e-2],
    [2.003160e+0, 9.388871e-1, 9.656450e-1],
  )

  const [ _b24, b25, _b27, b28 ] = $.from_coefficients(
    [1.609901e+1, 7.391573e+0, 2.277010e+1, 8.334227e+0],
    [1.747500e-1, 6.271202e-2, -2.324229e-2, -1.844559e-2],
    [2.752869e+0, 2.729201e-2, 4.996927e-1, 2.496551e-1],
    [3.518506e+0, 1.112440e+0, -4.556216e-1, -2.179426e-1],
  )
  const b24 = _b24**b28
  const b26 = 5.0 - 0.09138012 * (Z**-0.3671407)
  const b27 = _b27**(2*b28)

  const [ b29, b30, _b31, b32, b33, _b34 ] = $.from_coefficients(
    [1.626062e+2, -1.168838e+1, -5.498343e+0],
    [3.336833e-1, -1.458043e-1, -2.011751e-2],
    [7.425137e+1, 1.790236e+1, 3.033910e+1, 1.018259e+1],
    [9.268325e+2, -9.739859e+1, -7.702152e+1, -3.158268e+1],
    [2.474401e+0, 3.892972e-1],
    [1.127018e+1, 1.622158e+0, -1.443664e+0, -9.474699e-1],
  )
  const b31 = _b31 ** b33
  const b34 = _b34 ** b33

  const [ _b36, _b37, _b38 ] = $.from_coefficients(
    [1.445216e-1, -6.180219e-2, 3.093878e-2, 1.567090e-2],
    [1.304129e+0, 1.395919e-1, 4.142455e-3, -9.732503e-3],
    [5.114149e-1, -1.160850e-2]
  )
  const b36 = _b36 ** 4
  const b37 = 4.0 * _b37
  const b38 = _b38 ** 4
  
  const [ b39, _b40, _b41, b42, b43, _b44 ] = $.from_coefficients(
    [1.314955e+2, 2.009258e+1, -5.143082e-1, -1.379140e+0],
    [1.823973e+1, -3.074559e+0, -4.307878e+0],
    [2.327037e+0, 2.403445e+0, 1.208407e+0, 2.087263e-1],
    [1.997378e+0, -8.126205e-1],
    [1.079113e-1, 1.762409e-2, 1.096601e-2, 3.058818e-3],
    [2.327409e+0, 6.901582e-1, -2.158431e-1, -1.084117e-1,]
  )
  const b40 = max(_b40, 1.0)
  const b41 = _b41 ** b42
  const b44 = _b44 ** 5

  // (H p.29)
  
  const [_b46, b48, b49] = (
    [2.214315e+0, -1.975747e+0],
    [5.072525e+0, 1.146189e+1, 6.961724e+0, 1.316965e+0],
    [5.139740e+0]
  )
  const b45 = ($.ρ < 0.0) ? 1.0 : 1.0 - ( 2.47162*$.ρ - 5.401682*($.ρ**2) + 3.2473613*($.ρ**3) )
  const b46 = -1.0 * _b46 * log10($.M.HeF / $.M.FGB)
  const b47 = 1.127733*$.ρ + 0.2344416*($.ρ**2) - 0.3793726*($.ρ**3)
  
  const [ _b51, b52, _b53, b54, _b55, _b56, _b57 ] = $.from_coefficients(
    [1.125124e+0, 1.306486e+0, 3.622359e+0, 2.601976e+0, 3.031270e-1],
    [3.349489e-1, 4.531269e-3, 1.131793e-1, 2.300156e-1, 7.632745e-2],
    [1.467794e+0, 2.798142e+0, 9.455580e+0, 8.963904e+0, 3.339719e+0],
    [4.658512e-1, 2.597451e-1, 9.048179e-1, 7.394505e-1, 1.607092e-1],
    [1.0422e+0, 1.3156e-1, 4.5000e-2],
    [1.110866e+0, 9.623856e-1, 2.735487e+0, 2.445602e+0, 8.826352e-1],
    [-1.584333e-1, -1.728865e-1, -4.461431e-1, -3.925259e-1, -1.276203e-1]
  )
  const b51 = _b51 - 0.134379 * ($.ζ ** 5)
  const b53 = _b53 - 0.4426929 * ($.ζ ** 5)
  const b55 = min(_b55, 0.99164 - 743.123*(Z**2.83))
  const b56 = _b56 + 0.1140142 * ($.ζ ** 5)
  const b57 = _b57 - 0.01308728 * ($.ζ ** 5)
    
  // END COEFFICIENTS
    
  $.fit = fit($.M.ZAMS)
  $.lerp = lerp($.M.ZAMS)
  
  // Zero-age main sequence mass and radius
  
  // (T1)
  {
    $.L.ZAMS = $.fit
    ([aα, 5.5], [aβ, 11])
    ([aγ, 0], [1, 3], [aδ, 5], [aε, 7], [aζ, 8], [aη, 9.5])
  }
  check($.L.ZAMS)
  
  // (T2)
  {
    $.R.ZAMS = $.fit
    ([aθ, 2.5], [aι, 6.5], [aκ, 11], [aλ, 19], [aμ, 19.5])
    ([aν, 0], [aξ, 2], [aο, 8.5], [1, 18.5], [aπ, 19.5])
  }
  check($.R.ZAMS)
  
  
  // [5.1] Main-sequence and Hertzsprung gap
  

  // (H66)
  {
    $.Mc.BAGB = (b36 * (M**b37) + b38) ** (1/4)
  }
  check($.Mc.BAGB)
  
  // (H4, H5, H6, H7)
  {
    $.t.BGB = $.fit
    ([a1, 0], [a2, 4], [a3, 5.5], [1, 7])
    ([a4, 2], [a5, 7])

    // (H7)
    const µ = max(0.5, 1 - 0.01 * max(a6 / (M**a7), a8 + a9/(M**a10)))
    
    $.t.hook = µ * $.t.BGB
    
    // (H6)
    const x = max(0.95, min(0.95 - 0.03*($.ζ + 0.30103), 0.99))
    
    // (H5)
    $.t.MS = max($.t.hook, x * $.t.BGB)
  }
  check($.t.BGB)
  check($.t.hook)
  check($.t.MS)
  
  // (H8)
  {
    $.L.TMS = $.fit
    ([a11, 3], [a12, 4], [a13, a16 + 1.8])
    ([a14, 0], [a15, 5], [1, a16])
  }
  check($.L.TMS)
  
  // (H9)
  {
    const c1 = -8.672073e-2
    const M_star = a17 + 0.1

    $.R.TMS = $.lerp(a17, M_star) (
      fit (max(M, a17)) ([a18, 0], [a19, a21]) ([a20, 0], [1, a22]),
      fit (min(M_star, M)) ([c1, 3], [a23, a26], [a24, a26+1.5]) ([a25, 0], [1, 5])
    )

    if(M < 0.5) $.R.TMS = max($.R.TMS, 1.5*$.R.ZAMS)
  }
  check($.R.TMS)
  
  // (H10)
  {
    const c2 = 9.301992
    const c3 = 4.637345
    
    $.L.BGB_ = ({ M }) => fit(M)
      ([a27, a31], [a28, c2])
      ([a29, 0], [a30, c3], [1, a32])
    $.L.BGB = $.L.BGB_({ M })
  }
  check($.L.BGB)

   // (H18)
  $.η = (Z > 0.0009 || M < 10) ? 10 : 20
  check($.η)

  
  // (H16)
  {
    const L_ = ({ M }) => min(a34 / (M**a35), a36 / (M**a37))
    
    $.L.Δ = ( M < $.M.hook ) ? 0
    : in_range($.M.hook, M, a33) ? L_({ M: a33 })*(((M - $.M.hook)/(a33 - $.M.hook))**0.4)
    : ( M > a33 ) ? L_({ M })
    : NaN
  }
  check($.L.Δ)
  
  // (H17)
  {
    
    const B = ({ M }) => fit(M)([a38, 0], [a39, 3.5])([a40, 3], [1, a41]) - 1

    $.R.Δ = ( M < $.M.hook ) ? 0
    : in_range($.M.hook, M, a42) ? a43 * sqrt((M - $.M.hook)/(a42 - $.M.hook))
    : in_range(a42, M, 2.0) ? a43 + (B({ M: 2.0 }) - a43)*(((M-a42)/(2-a42))**a44)
    : ( M > 2.0 ) ? B({ M })
    : NaN
  }
  check($.R.Δ)
  
  // (H19)
  {
    
    const B = ({ M }) => fit(M)([a45, 0], [a46, a48])([1, 0.4], [a47, 1.9])
    
    $.L.α = ( M < 0.5) ? a49
    : in_range(0.5, M, 0.7) ? a49 + 5.0*(0.3 - a49)*(M - 0.5)
    : in_range(0.7, M, a52) ? 0.3 + (a50 - 0.3)*(M - 0.7)/(a52 - 0.7)
    : in_range(a52, M, a53) ? a50 + (a51 - a50)*(M - a52)/(a53 - a52)
    : in_range(a53, M, 2.0) ? a51 + (B({ M: 2.0 }) - a51)*(M - a53)/(2.0 - a53)
    : ( M > 2.0 ) ? B({ M })
    : NaN
  }
  check($.L.α)
  
  // (H20)
  {
    const B = ({ M }) => max(0.0, a54 - a55*(M**a56))
    $.L.β = (M > a57 && B({ M }) > 0.0) 
    ? max(0.0, B({ M: a57 }) - 10.0*B({ M: a57 })*(M-a57))
    : B({ M })
  }
  check($.L.β)
  
  // (H21)
  {        
    const B = ({ M }) => fit(M)([a58, a60])([a59, a61])
    const a64 = (_a68 > a66) ? B({ M: a66 }) : _a64
    
    $.R.α = in_range(a66, M, a67) ? B({ M })
    : (M < 0.5) ? a62
    : in_range(0.5, M, 0.65) ? a62 + (a63-a62)*(M-0.5) / 0.15
    : in_range(0.65, M, a68) ? a63 + (a64-a63)*(M-0.65) / (a68 - 0.65)
    : in_range(a68, M, a66) ? a64 + (B({ M: a66 }) - a64)*(M - a68) / (a66 - a68)
    : (M > a67) ? B({ M: a67 }) + a65*(M - a67)
    : NaN
  }
  check($.R.α)
  
  // (H22)
  {
    
    const B = ({ M }) => fit(M)([a69, 3.5])([a70, 0], [1, a71])
    const _β = (M < 1.0) ? 1.06
    : in_range(1.0, M, a74) ? 1.06 + (a72 - 1.06)*(M - 1.0)/(a74 - 1.06)
    : in_range(a74, M, 2.0) ? a74 + (B({ M: 2.0 }) - a72)*(M - a74)/(2.0 - a74)
    : in_range(2.0, M, 16.0) ? B({ M })
    : (M > 16.0) ? B({ M: 16.0 }) + a73*(M - 16.0)
    : NaN
    $.R.β = 1 - _β
  }
  check($.R.β)
  
  // (H23)
  {
    const B = ({ M }) => a76 + a77*((M-a78)**a79)
    const C = (a75 < 1.0) ? C = B({ M: 1.0 }) : a80
    $.R.γ = (M > a75 + 0.1) ? 0.0
    : (M <= 1.0) ? B({ M })
    : in_range(1.0, M, a75) ? B({ M: 1.0 }) + (a80 - B({ M: 1.0 }))*(((M-1.0)/(a75-1.0))**a81)
    : in_range(a75, M, a75+1.0) ? C - 10.0*(M-a75)*C
    : NaN
  }
  check($.R.γ)
  
  // (H11, H12, H13, H14, H15, H24)
  {
    // (H11)
    $.τ.MS_ = ({ t }) => t / $.t.MS

    // (H12)
    $.L.MS_ = ({ τ, τ1, τ2 }) => $.L.ZAMS * exp10(
      $.L.α*(τ) 
      + $.L.β*(τ**$.η)
      + (log10($.L.TMS/$.L.ZAMS) - $.L.α - $.L.β)*(τ*τ)
      - $.L.Δ*(τ1*τ1 - τ2*τ2)
    )

    // (H13, H24)
    $.R.MS_ = ({ τ, τ1, τ2 }) => max(
      $.R.ZAMS * exp10(
        $.R.α*(τ) 
        + $.R.β*(τ**10)
        + $.R.γ*(τ**40)
        + (log10($.R.TMS/$.R.ZAMS) - $.R.α - $.R.β - $.R.γ)*(τ*τ*τ)
        - $.R.Δ*(τ1*τ1*τ1 - τ2*τ2*τ2)
      ), 
      0.0258 * ((1.0 + $.X)**(5/3)) * (M**(-1/3))
    )
    
    const ε = 0.01

    // (H14)
    $.τ.MS_1_ = ({ t }) => min(1.0, t/$.t.hook)

    // (H15)
    $.τ.MS_2_ = ({ t }) => clamp(0.0, (t - (1.0 - ε)*$.t.hook)/(ε * $.t.hook), 1.0)
  }

  // (H46)
  {
    const A = min(b4 * (M**-b5), b6 * (M**-b7))
    $.R.GB_ = ({ L }) => 
      A * (L**b1 + b2*(L**b3))
  }
  
  // (H74)
  {   
    const M1 = $.M.HeF - 0.2
    const M2 = $.M.HeF
    const A1_ = ({ M }) => b56 + b57*M
    const A2_ = ({ M }) => min(b51 * (M**-b52), b53 * (M**-b54))
    $.R.AGB_ = ({ L }) => $.lerp(M1, M2)( 
      A1_({ M: max(M1, M) }) * ((L**b1) + b2*(L**(b55*b3))), 
      A2_({ M: min(M, M2) }) * ((L**b1) + b2*(L**b3)), 
    )
  }


  // (H77, H78)
  {
    // (H77)
    $.L.ZHe_ = ({ M }) => $.fit
      ([15262, 10.25])
      ([1, 9], [29.54, 7.5], [31.18, 6], [0.0469, 0])
    $.L.ZHe = $.L.ZHe_({ M })
    
    // (H78)
    $.R.ZHe_ = ({ M }) => $.fit
      ([0.2391, 4.6])
      ([1, 4], [0.162, 3], [0.0065, 0])
    $.R.ZHe = $.R.ZHe_({ M })
  }
  check($.L.ZHe)
  check($.R.ZHe)
  
  // (H79)
  {
    $.t.HeMS_ = ({ M }) => fit(M)
      ([0.4129, 0], [18.81, 4], [1.853, 6])
      ([1, 6.5])
    $.t.HeMS = $.t.HeMS_({ M })
  }

   // (H49, H50)
  {
    
    const B = ({ M }) => fit(M)([b11, 0], [b12, 3.8])([b13, 0], [1, 2])
    const α1 = (b9*($.M.HeF**b10) - B({ M: $.M.HeF })) / B({ M: $.M.HeF })
    
    // (H49)
    $.L.HeI_ = ({ M }) => $.regimes({
      LM: (b9 * (M**b10)) / (1 + α1*exp(15*(M - $.M.HeF))),
      IM_HM: B({ M })
    })
    $.L.HeI = $.L.HeI_({ M })
    
    // (H50b)
    const µ = log10(M/12.0) / log10($.M.FGB/12.0)

    // (H50a)
    $.R.HeI_ = ({ Mc }) => (M < $.M.FGB) ? $.R.GB_({ L: $.L.HeI })
    : (M > max($.M.FGB, 12.0)) ? $.R.mHe_({ Mc })
    : in_range($.M.FGB, M, 12.0) ? $.R.mHe * (($.R.GB_({ L: $.L.HeI }) / $.R.mHe_({ Mc })) ** µ)
    : NaN

    // (H p.6)
    $.L.EHG = (M < $.M.FGB) ? $.L.BGB : $.L.HeI
    $.R.EHG_ = ({ Mc }) => (M < $.M.FGB) ? $.R.GB_({ L: $.L.BGB }) : $.R.HeI_({ Mc })
  }
  check($.L.HeI)
  check($.L.EHG)
  
  // (H51)
  { 
    const c = b17/($.M.FGB**0.1) + (b16*b17 - b14)/($.M.FGB**(b15 + 0.1))
    $.L.min_He_ = ({ M }) => $.L.HeI * fit(M)
      ([b14, 0], [c, b15+0.1])
      ([b16, 0], [1, b15])
    $.L.min_He = $.L.min_He_({ M })
  }
  check($.L.min_He)
  
  // (H52, H53, H54, H55)
  {
    const µ_ = ({ Mc }) => (M - Mc)/($.M.HeF - Mc)
    
    // (H53)
    const α2_ = ({ Mc }) => 
      (b18 + $.L.ZHe_({ M: Mc }) 
      - $.L.min_He_({ M })) 
      / ($.L.min_He_({ M: $.M.HeF }) - $.L.ZHe_({ M: Mc }))
    
    $.L.ZAHB_ = ({ M = $.M.ZAMS, Mc } = {}) => $.L.ZHe_({ Mc }) 
      + ((1 + b20) / (1 + b20*(µ_({ Mc })**1.6479)))
      * (b18 * (µ_({ Mc })**b19)) / (1 + α2_({ Mc }) * exp(15 * (M - $.M.HeF)))

    // (H54)
    const f_ = ({ Mc }) => 
      ( (1.0 + b21) * (µ_({ Mc }) ** b22) ) 
      / ( 1.0 + b21 * (µ_({ Mc }) ** b23) )
      
    $.R.ZAHB_ = ({ Mc }) => 
      mix($.R.GB_({ L: $.L.ZAHB }), $.R.ZHe_({ Mc }))(f_({ Mc }))
    
    const R_ = ({ M }) => fit(M)
      ([b24, 1], [b25**b26, b26+b28])
      ([b27, 0], [1, b28])
      
    const R1 = R_({ M })
    const R2_ = ({ Mc }) => $.R.GB_({ L: $.L.ZAHB_({ Mc }) })
      *((R_({ M: $.M.HeF }) / $.R.GB_({ L: $.L.ZAHB_({ M: $.M.HeF, Mc }) })) ** µ_({ Mc }))

    // (H55)
    $.R.mHe_ = ({ Mc }) => (M > $.M.HeF) ? R1 : R2_({ Mc })
    
    
    const L_ = ({ M }) => fit(M)
      ([b31, 0], [b32, b33+1.8])
      ([b34, 0], [1, b33])
      
    const α3 = 
      ( b29 * ($.M.HeF**b30) - L_({ M: $.M.HeF }) ) 
      / L_({ M: $.M.HeF })
    
    // (H56)
    $.L.BAGB = (M > $.M.HeF) ? L_({ M })
    : (b29 * (M**b30)) / (1 + α3 * exp(15 * M - $.M.HeF))
    
    $.R.BAGB = $.R.AGB_({ L: $.L.BAGB })
    
    const t_ = ({ M }) => $.t.BGB * fit(M)
      ([b41, b42], [b43, 5])
      ([b44, 0], [1, 5])
      
    const α4 = (t_({ M: $.M.HeF }) - b39)/b39

    // (H57)
    $.t.He_ = ({ Mc }) => $.regimes({
      LM: (b39 + ($.t.HeMS_({ M: Mc }) - b39) * ((1 - µ_({ Mc }))**b40))
        * (1 + α4*exp(15 * (M - $.M.HeF))),
      IM_HM: t_({ M })
    })
  }
  check($.L.BAGB)
  check($.R.BAGB)
  
  // (H p.10)
  // (H34, H37, H38, H39, H40, H41, H42, H43)
  {
    const F = $.lerp($.M.HeF, 2.5)
    const p = F(6, 5)
    const q = F(3, 2)
    const B = max(3e+4, 500 + 1.75e+4 * (M**0.6))
    const D0 = 5.37 * 0.135 * $.ζ
    const D = exp10(F(
      D0, max(-1.0, max(0.975*D0 - 0.18*M, 0.5*D0 - 0.06*M))
    ))
    
    // (H31)
    $.Mc.L_ = ({ L }) => (L/D) ** (1/p)
    
    // (H37)
    $.L.Mc_ = ({ Mc }) => min(B * (Mc**q), D * (Mc**p))

    $.general_giant = ({ A, ta, La, Lb, _t_inf_2}) => {
    
      // (H34)
      const Mc__ = ({ p, D, t_inf, t }) =>
        ( (p-1) * A * D * (t_inf - t) ) ** ( 1 / (1-p) )

      // (H38)
      // crossover point
      const Mx = (B/D)**(1/(p - q))    
      const Lx = $.L.Mc_({ Mc: Mx })
    
      // (H40)
      const t_inf_1 = ta
        + (1/(A * D * (p-1)))
        * ( (D/La)**((p-1)/p) )

      // (H41)
      // t at crossover point
      const tx = t_inf_1
        - (t_inf_1 - ta) 
        * ( (La/Lx) ** ((p-1)/p) )

      // (H42)
      const t_inf_2 = _t_inf_2 ? _t_inf_2({ p, q, B, D }) 
        : tx
          + (1/(A * B * (q-1))) 
          * ( (B/Lx) ** ((q-1)/q) )
        
      // (H37)
      const L_ = ({ t }) => min(
        B * (Mc__({ p: q, D: B, t_inf: t_inf_1, t }) ** q), 
        D * (Mc__({ p: p, D: D, t_inf: t_inf_2, t }) ** p)
      )

      // (H39)
      const Mc_ = ({ t }) => ( 
        (t < tx) 
        ? Mc__({ p: p, D: D, t_inf: t_inf_1, t })
        : Mc__({ p: q, D: B, t_inf: t_inf_2, t })
      )

      // (H43)  
      const tb1 = t_inf_1 
        - (1/(A * D * (p-1)))
        * ((D/Lb)**((p-1)/p))
      const tb2 = t_inf_2
        - (1/(A * B * (q-1)))
        * ((B/Lb)**((q-1)/q))
      const t = (Lb < Lx) ? tb1 : tb2
        
      return { L_, Mc_, t }
    }
  }

  {
    const { L_, Mc_, t } = $.general_giant({
      A: A_H, ta: $.t.BGB, 
      La: $.L.BGB, Lb: $.L.HeI
    })
    
    $.L.GB_ = ({ t }) => L_({ t })
    $.Mc.GB__ = ({ t }) => Mc_({ t })
    $.t.HeI = t
  }
  check($.t.HeI)
  
  // (H44)
  {
    const c1 = 9.20925e-5
    const c2 = 5.402216
    const C_BCB = ($.Mc.L_({ L: $.L.BGB_({ M: $.M.HeF }) }) ** 4) 
      - c1*($.M.HeF ** c2)

    // (H44)
    $.Mc.BGB = min(
      0.95 * $.Mc.BAGB, 
      ( C_BCB + c1*(M**c2) ) ** (1/4)
    )

    const C_HeI = ($.Mc.L_({ L: $.L.HeI_({ M: $.M.HeF }) }) ** 4) - c1*($.M.HeF ** c2)

    // (H p.13)
    $.Mc.HeI = $.regimes({
      LM: $.Mc.L_({ L: $.L.HeI }),
      IM_HM: ( C_HeI + c1*(M**c2) ) ** (1/4)
    })
  }
  check($.Mc.HeI)
  
  // (H25, H26, H27, H28, H29, H30) 
  {
    // (H25)
    $.τ.HG_ = ({ t }) => (t - $.t.MS) / ($.t.BGB - $.t.MS)
    
    // (H26)
    $.L.HG_ = ({ τ }) => $.L.TMS * (($.L.EHG / $.L.TMS) ** τ)

    // (H27)
    $.R.HG_ = ({ Mc, τ }) => $.R.TMS * (($.R.EHG_({ Mc }) / $.R.TMS) ** τ)
    $.Mc.MS = 0.0
    
    // (H28)
    $.Mc.EHG =  $.regimes({
      LM: $.Mc.BGB, // $.Mc.GB
      IM: $.Mc.BGB,
      HM: $.Mc.HeI
    })
    
    // (H29)
    const ρ = (1.586 + (M**5.25)) / (2.434 + 1.02*(M**5.25))
    $.Mc.TMS = ρ * $.Mc.EHG

    // (H30)
    $.Mc.HG_ = ({ τ }) => ((1-τ)*ρ + τ) * $.Mc.EHG
  }
  check($.Mc.EHG)
  check($.Mc.TMS)
  
  // [5.2] First giant branch
  
  
  // (H45)
  {
    // (H p.11)
    $.τ.GB_ = ({ t }) => (t - $.t.BGB) / ($.t.HeI - $.t.BGB)
    
    // (H45)
    $.Mc.GB_ = ({ t, τ }) => (M > $.M.HeF) ? $.Mc.BGB + ($.Mc.HeI - $.Mc.BGB) * τ
    : $.Mc.GB__({ t })
  }
  
  // [5.3] Core helium burning
 
  
  
  
  // (H58, H59, H60)
  {
    $.τ.CHeB_ = ({ t }) => (t - $.t.HeI) / $.t.He_({ Mc: $.Mc.HeI })
   
    // (H58c)
    // original formulation raised a negative number to a fraction.
    // merged that part dircetly to H58b to avoid issues
    const α_bl = (1 - b45*(($.M.HeF/$.M.FGB)**0.414)) 
    
    // (H58b)
    const f_bl_ = ({ M }) => 
      (M**b48) 
      * ((1 - $.R.mHe_({ M })/$.R.AGB_({ L: $.L.HeI })) ** b49)
    const f_bl = f_bl_({ M })

    // (H58a)
    const τ_bl = $.regimes({
      LM: 1.0,
      IM: b45*((M/$.M.FGB)**0.414) + α_bl*(( ln(M/$.M.FGB) / ln($.M.HeF/$.M.FGB) )**b46),
      HM: (1-b47) * f_bl_({ M }) / f_bl_({ M: $.M.FGB })
    })
    
    // (H p.12)
    const τx = $.regimes({ LM: 0, IM: 1 - τ_bl, HM: 0 })
    
    // (H59)
    const Lx_ = ({ Mc }) => $.regimes({
      LM: $.L.ZAHB_({ Mc }),
      IM: $.L.min_He,
      HM: $.L.HeI
    })

    // (H60)
    const Rx_ = ({ Mc }) => $.regimes({
      LM: $.R.ZAHB_({ Mc }),
      IM: $.R.GB_({ L: $.L.min_He }),
      HM: $.R.HeI_({ Mc })
    })
    
    // (H62b)
    const ξ_ = ({ Mc }) => min(2.5, max(0.4, $.R.mHe_({ Mc }) / Rx_({ Mc })))
    
    // (H62)
    const λ_ = ({ Mc, τ }) => ((τ - τx) / (1 - τx)) ** ξ_({ Mc })
    
    // (H63)
    const _λ_ = ({ Mc, τ }) => ((τx - τ) / τx) ** 3
    
    // (H61)
    $.L.CHeB_ = ({ Mc, τ }) => 
      in_range(τx, τ, 1) 
      ? Lx_({ Mc }) * (($.L.BAGB/Lx_({ Mc })) ** λ_({ Mc, τ })) 
      : Lx_({ Mc }) * (($.L.HeI/Lx_({ Mc })) ** _λ_({ Mc, τ }))
    
    const Rmin_ = ({ Mc }) => min($.R.mHe_({ Mc }), Rx_({ Mc }))
    
    const τy = $.regimes({ LM_IM: 1, HM: τ_bl })
    const Ly = $.regimes({ LM_IM: $.L.BAGB, HM: NaN })
    const Ry = $.R.AGB_({ L: Ly })
    
    // (H65)
    const ρ_ = ({ Mc, τ }) => 
      (ln(Ry / Rmin_({ Mc })) ** (1/3)) * ((τ-τx)/(τy - τx))
      - (ln(Rx_({ Mc }) / Rmin_({ Mc })) ** (1/3)) * ((τy - τ)/(τy - τx))
    
    // (H64)
    $.R.CHeB_ = ({ Mc, τ }) => $.R.GB_({ L: $.L.CHeB_({ Mc, τ }) })
    /*
      in_range(0, τ, τx) ? $.R.GB_({ L: $.L.CHeB_({ Mc, τ }) })
      : in_range(τy, τ, 1) ? $.R.AGB_({ L: $.L.CHeB_({ Mc, τ }) })
      : in_range(τx, τ, τy) ? Rmin_({ Mc }) * exp(abs(ρ_({ Mc, τ })) ** 3)
      : NaN
      */
   
    // (H67)
    $.Mc.CHeB_ = ({ τ }) => mix($.Mc.HeI, $.Mc.BAGB)(τ)
  }
  
  {
    // (H p.13)
    $.t.BAGB = $.t.HeI + $.t.He_({ Mc: $.Mc.BAGB })
  }
  
  // (H69, H70)
  { 
    // (H69)
    $.Mc.DU = 0.44 * $.Mc.BAGB + 0.448
    $.L.DU = $.L.Mc_({ Mc: $.Mc.DU })
    
    const { L_, Mc_, t } = $.general_giant({
      A: A_He, ta: $.t.BAGB, 
      La: $.L.BAGB, Lb: $.L.DU
    })
    
    $.L.EAGB_ = ({ t }) => L_({ t })
    $.Mc.EAGB_ = ({ t }) => Mc_({ t })
    $.t.DU = t
  }
  
  {
    // (H73)
    const λ = min(0.9, 0.3 + 0.001*(M**5))

    // (H72)
    const t_inf_2 = ({ B, q }) => $.t.DU
      + 1/((q-1) * A_H_He * B)
      * ((B/$.L.DU) ** ((q-1)/q))
      
    const { L_, Mc_, t } = $.general_giant({
      A: A_H_He, ta: $.t.DU, 
      La: $.L.DU, Lb: $.L.DU,
      _t_inf_2: t_inf_2
    })
    $.L.TPAGB_ = ({ t }) => L_({ t })
    $.Mc.TPAGB_ = ({ t }) => $.Mc.DU + (1-λ) * (Mc_({ t }) - $.Mc.DU)
    $.t.SN = t
  }
  
  // (H75)
  {
    $.Mc.SN = max(M_chandra, 0.773 * $.Mc.BAGB - 0.35)
  }
 
  $.bubble = {}
  $.color = ""
  
  stars[id] = $
  star_update(id, 0)
}

const bubbles = []
const borders = []

const star_update = (id, t) => {
  const $ = stars[id]
  const phase = in_range(0, t, $.t.MS) ? ($.M < 0.7 ? phases.C_MS : phases.MS)
  : in_range($.t.MS, t, $.t.BGB) ? phases.HG
  : in_range($.t.BGB, t, $.t.HeI) ? phases.GB
  : in_range($.t.HeI, t, $.t.BAGB) ? phases.CHeB
  : in_range($.t.BAGB, t, $.t.DU) ? phases.EAGB
  : ( t > $.t.DU && $.Mc.CO < $.Mc.SN ) ? phases.TPAGB
  : ($.Mc.CO > $.Mc.SN) ? ( ($.Mc.SN > 7.0) ? phases.BH : phases.NS )
  : ( ($.Mc.BAGB < 1.6) ? phases.CO_WD : phases.ONe_WD )
  
 // relative time
  
  switch(phase){
    // Main sequence
    case phases.C_MS:
    case phases.MS: {
      const τ = $.τ.MS_({ t })
      const τ1 = $.τ.MS_1_({ t })
      const τ2 = $.τ.MS_2_({ t })
      
      const L = $.L.MS_({ τ, τ1, τ2 })
      const R = $.R.MS_({ τ, τ1, τ2 })

      $.L.now = L
      $.R.now = R
      $.border = "white"
      break
    }
    // Hertzsprung gap
    case phases.HG: {
      const τ = $.τ.HG_({ t })
      
      const Mc = $.Mc.HG_({ τ })
      
      const L = $.L.HG_({ τ })
      const R = $.R.HG_({ Mc, τ })
      
      $.L.now = L
      $.R.now = R
      $.border = "hotpink"      
      //console.log("HG", Mc, L,R)
      break
    }
    // Giant branch
    case phases.GB: {
      const τ = $.τ.GB_({ t })
      
      const Mc = $.Mc.GB_({ t, τ })

      const L = $.L.GB_({ t })
      const R = $.R.GB_({ L })  

      $.R.now = R
      $.L.now = L
      $.border = "gold"
      //console.log("GB", Mc, L,R)
      break
    }
    // Helium burning
    case phases.CHeB: {
      const τ = $.τ.CHeB_({ t })
      
      const Mc = $.Mc.CHeB_({ τ })
      
      const L = $.L.CHeB_({ Mc, τ })
      const R = $.R.CHeB_({ Mc, τ })

      $.L.now = L
      $.R.now = R

      $.border = "red"

      //console.log("CHeB", { τ, Mc, L,R })
      break
    }
    // Early AGB
    case phases.EAGB: {
      const Mc = $.Mc.EAGB_({ t })

      const L = $.L.EAGB_({ t })
      const R = $.R.AGB_({ L })  
      
      $.R.now = R
      $.L.now = L
      $.border = "aquamarine"
      
      // console.log("EAGB", Mc, L,R)
      break
    }
    // Thermal pulsating AGB
    case phases.TPAGB: {
      const Mc = $.Mc.TPAGB_({ t })

      const L = $.L.TPAGB_({ t })
      const R = $.R.AGB_({ L })  
      
      $.R.now = R
      $.L.now = L
      $.border = "cornflowerblue"
      
      // console.log("TPAGB", Mc, L,R)
      break
    }
    // Supernova
    case phases.SN: {
      $.R.now = 1
      $.border = "mediumpurple"
      break
    }
    // Black hole
    case phases.BH: {
      $.R.now = 10
      $.L.now = 0
      $.border = "black"
      break
    }
    // Neutron star
    case phases.NS: {
      $.R.now = 0.2
      $.border = "blue"
      break
    }
    // CO white dwarf
    case phases.CO_WD: {
      $.R.now = 0.1
      $.border = "white"
      break
    }
    // ONe white dwarf
    case phases.ONe_WD: {
      $.R.now = 0.1
      $.border = "white"
      break
    }
    // no remnant
    case phases.R: {
      $.R.now = 0.1
      $.L.now = 0
      $.border = "black"
      break
    }
  }
  if(phase.index < 15) {
    //console.log(JSON.stringify($,"",2))
    //console.log(phase)
  }
 
  $.T.now = radius_lum_to_temp($.R.now, $.L.now)
  $.opacity = clamp(0.1, 100/$.R.now, 1)

  $.bubble.T = $.T.now
  $.bubble.L = $.L.now
  $.bubble.R = $.R.now
  $.bubble.M = $.M.ZAMS.toPrecision(2)

  $.bubble.x = to_01(max_temp, min_temp)($.bubble.T)
  $.bubble.y = to_01(log10(min_sol_lum), log10(max_sol_lum))(log10($.bubble.L))
  $.bubble.r = $.bubble.R * 0.01

  $.bubble.color = temp_to_rgb($.T.now)
  $.bubble.limbColor = temp_to_rgb($.T.now*0.5) // limbColor darkening

  bubbles[id] = $.bubble
}

for(let i = 0; i < n_stars;){
  const mass = random_range(min_mass, max_mass)
  
  // Reject unlikely masses
  const test_mass = random_range(min_mass, max_mass)
  if(initial_mass_function(mass) < initial_mass_function(test_mass)) continue
  
  const metallicity = random_range(min_metal, max_metal)
  
  star_init(i, mass, metallicity)
  i++
}

const $time_pause = document.getElementById("time-pause")
const $time_slider = document.getElementById("time-slider")
const $time_number = document.getElementById("time-number")
let pause = false
let time = 0
let then = 0

// init

const base_vs = `#version 300 es

uniform mat4 u_viewProjection;
uniform float u_time;

in vec4 a_position;
in vec2 a_texcoord;
in vec3 a_normal;

in float a_instanceID;
in vec3 a_instanceColor;
in vec3 a_instanceLimbColor;
in mat4 a_instancePosition;

out float v_id;
out vec4 v_position;
out vec2 v_texCoord;
out vec3 v_normal;
out vec3 v_color;
out vec3 v_limbColor;

#define UI0 1597334673U
#define UI1 3812015801U
#define UI2 uvec2(UI0, UI1)
#define UI3 uvec3(UI0, UI1, 2798796415U)
#define UI4 uvec4(UI3, 1979697957U)
#define UIF (1.0 / float(0xffffffffU))

vec3 hash33(vec3 p)
{
	uvec3 q = uvec3(ivec3(p)) * UI3;
	q = (q.x ^ q.y ^ q.z)*UI3;
	return vec3(q) * UIF;
}

float voronoise(vec3 p)
{
  vec3 i = floor(p);
  vec3 f = fract(p);

  vec2 a = vec2(0.0,0.0);
  for( int z=-2; z<=2; z++ )
  for( int y=-2; y<=2; y++ )
  for( int x=-2; x<=2; x++ )
  {
    vec3 g = vec3( x, y, z );
    vec3 o = hash33( i + g);
    vec3 d = g - f + o;
    float w = 1.0-smoothstep(0.0,1.414,length(d));
    a += vec2(o.z*w,w);
  }

  return a.x/a.y;
}
void main() {
  v_id = a_instanceID;
  v_color = a_instanceColor;
  v_limbColor = a_instanceLimbColor * a_instanceColor * a_instanceColor;

  vec4 surfacePosition = a_position + vec4(a_normal * (1.0 + 0.2*voronoise(8.0*a_normal + 100.0*v_id)) , 0.0);
  vec4 worldPosition = a_instancePosition * surfacePosition;
  v_position = u_viewProjection * worldPosition;

  v_normal = (a_instancePosition * vec4(a_normal, 0)).xyz;

  v_texCoord = a_texcoord;

  gl_Position = v_position;
}
`

const base_fs = `#version 300 es
precision highp float;

in float v_id;
in vec4 v_position;
in vec3 v_color;
in vec3 v_limbColor;
in vec2 v_texCoord;
in vec3 v_normal;

uniform float u_time;
uniform sampler2D u_diffuse;

out vec4 outColor;

const mat2 m = mat2( 0.80,  0.60, -0.60,  0.80 );

float noise( in vec2 p )
{
	return sin(p.x)*sin(p.y);
}

float fbm4( vec2 p )
{
    float f = 0.0;
    f += 0.5000*noise( p ); p = m*p*2.02;
    f += 0.2500*noise( p ); p = m*p*2.03;
    f += 0.1250*noise( p ); p = m*p*2.01;
    f += 0.0625*noise( p );
    return f/0.9375;
}

float fbm6( vec2 p )
{
    float f = 0.0;
    f += 0.500000*(0.5+0.5*noise( p )); p = m*p*2.02;
    f += 0.250000*(0.5+0.5*noise( p )); p = m*p*2.03;
    f += 0.125000*(0.5+0.5*noise( p )); p = m*p*2.01;
    f += 0.062500*(0.5+0.5*noise( p )); p = m*p*2.04;
    f += 0.031250*(0.5+0.5*noise( p )); p = m*p*2.01;
    f += 0.015625*(0.5+0.5*noise( p ));
    return f/0.96875;
}

vec2 fbm4_2( vec2 p )
{
    return vec2(fbm4(p), fbm4(p+vec2(7.8)));
}

vec2 fbm6_2( vec2 p )
{
    return vec2(fbm6(p+vec2(16.8)), fbm6(p+vec2(11.5)));
}

//====================================================================

float func( vec2 q, out vec4 ron )
{
    q += 0.03*sin( vec2(27,23)*u_time + length(q)*vec2(4.1,4.3));

	vec2 o = fbm4_2( 0.9*q );

    o += 0.04*sin( vec2(12,14)*u_time + length(o));

    vec2 n = fbm6_2( 3.0*o );

	ron = vec4( o, n );

    float f = 0.5 + 0.5*fbm4( 1.8*q + 6.0*n );

    return mix( f, f*f*f*3.5, f*abs(n.x) );
}

float fbm_layered(vec2 p) {
  float e = 2.0;

  vec4 on = vec4(0.0);
  float f = func(p, on);

  float o = 0.0;
  o = f * dot(on.zw,on.zw) * (0.2 + 0.5*on.y*on.y) * smoothstep(1.2,1.3,abs(on.z)+abs(on.w));

  return o;
}

void main() {
  vec3 texColor = texture(u_diffuse, v_texCoord*4.0).rgb;
  float noise = 1.0 - 0.8*fbm_layered(v_texCoord*30.0 + v_id);

  vec3 normal = normalize(v_normal);
  vec3 baseColor = mix(v_limbColor, v_color, normal.z*noise);

  outColor = vec4(baseColor, 1.0);
}
`

const framebufferInfo = twgl.createFramebufferInfo(gl)
twgl.bindFramebufferInfo(gl, framebufferInfo)

const baseProgramInfo = twgl.createProgramInfo(gl, [base_vs, base_fs]);

const process_vs = `#version 300 es

in vec4 a_position;

uniform vec2 u_resolution;

out vec2 v_texcoord;

void main() {
  gl_Position = a_position;
  v_texcoord = (a_position.xy * 0.5 + 0.5) * u_resolution;
}
`;
const process_fs = `#version 300 es
precision highp float;

in vec2 v_texcoord;
uniform vec2 u_resolution;
uniform sampler2D u_texture;

out vec4 outColor;

#define W 32.0
#define SQRT32 0.866025403784
#define SQUARE(u) u*u

vec3 tex(ivec2 p) {
  return SQUARE(texelFetch(u_texture, p, 0).rgb);
}

void main() {
  ivec2 pos = ivec2(v_texcoord);

  vec3 col = tex(pos) * 0.7;

  for(float i=-W; i<W; i+=4.0){
    if(i==0.0) continue;
    float X = 1.0 - abs(i/W);
    X = 4.0*X*X;
    for(float j =-X; j<X; j++) {
      if(j==0.0) continue;
      float f = exp(-0.1*i*i*j*j/W/W/W/W) / W * 0.2; // normal distribution
      col += f * (
        tex(pos + ivec2( j, i )) +
        tex(pos + ivec2( SQRT32*i + 0.5*j, +0.5*i + SQRT32*j )) +
        tex(pos + ivec2( SQRT32*i - 0.5*j, -0.5*i + SQRT32*j ))
      );
    }
  }

  outColor = vec4(sqrt(col), 1.0);
}
`;

const processProgramInfo = twgl.createProgramInfo(gl, [process_vs, process_fs]);

twgl.setAttributePrefix("a_")

const starArrays = twgl.primitives.createSphereVertices(0.5, 128, 64)

const screenVAO = gl.createVertexArray()
gl.bindVertexArray(screenVAO)
const screenVertices = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, screenVertices)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1,
]), gl.STATIC_DRAW)
const positionLoc = gl.getAttribLocation(processProgramInfo.program, "a_position")
gl.enableVertexAttribArray(positionLoc)
gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

const tex = twgl.createTexture(gl, {
  min: gl.NEAREST,
  mag: gl.NEAREST,
  src: [
    255, 255, 255, 255,
    192, 192, 192, 255,
    192, 192, 192, 255,
    255, 255, 255, 255,
  ],
});

const uniforms = {
  u_diffuse: tex,
  u_time: 0,
};
const screenUniforms = {
  u_texture: framebufferInfo.attachments[0],
  u_resolution: [0,0],
}

const draw = async (now) => {
  if(then) time += (now-then)/1000
  then = now
  $time_slider.value = log10(1 + time).toFixed(2)
  $time_number.value = time.toFixed(2)
  await Promise.all(Object.keys(stars).map(id => star_update(id, time)))

  {
    twgl.bindFramebufferInfo(gl, framebufferInfo)
    gl.useProgram(baseProgramInfo.program);

    gl.enable(gl.CULL_FACE)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const zoom = 1
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0;
    const zFar = 200;
    const projection = m4.ortho(-zoom*aspect, zoom*aspect, -zoom, zoom, zNear, zFar)
    const eye = [0, 0, 100];
    const target = [0, 0, 0];
    const up = [0, 1, 0];

    const camera = m4.lookAt(eye, target, up);
    const view = m4.inverse(camera);
    uniforms.u_viewProjection = m4.multiply(projection, view);
    uniforms.u_time = time


    const instancePositions = new Float32Array(n_stars * 16)
    const instanceIDs = []
    const instanceColors = []
    const instanceLimbColors = []

    Object.entries(stars)
    .sort(( [a_id, a_$], [b_id, b_$] ) => (b_$.bubble.r  - a_$.bubble.r)) // depth sort by radius
    .forEach(( [id, $], i ) => {
      const mat = new Float32Array(instancePositions.buffer, i * 16 * 4, 16)
      m4.identity(mat)
      m4.translate(mat, [to_11($.bubble.x)*aspect, to_11($.bubble.y), 0 ],mat)
      m4.rotateY(mat, time, mat)
      m4.scale(mat, [ $.bubble.r, $.bubble.r, $.bubble.r ], mat)

      instanceIDs.push(i*100.0)
      instanceColors.push(...$.bubble.color)
      instanceLimbColors.push(...$.bubble.limbColor)
    })

    Object.assign(starArrays, {
      instancePosition: {
        numComponents: 16,
        data: instancePositions,
        divisor: 1,
      },
      instanceID: {
        numComponents: 1,
        data: instanceIDs,
        divisor: 1,
      },
      instanceColor: {
        numComponents: 3,
        data: instanceColors,
        divisor: 1,
      },
      instanceLimbColor: {
        numComponents: 3,
        data: instanceLimbColors,
        divisor: 1,
      },
    })
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, starArrays)
    const vertexArrayInfo = twgl.createVertexArrayInfo(gl, baseProgramInfo, bufferInfo)
    
    twgl.setBuffersAndAttributes(gl, baseProgramInfo, vertexArrayInfo);
    twgl.setUniforms(baseProgramInfo, uniforms);
    twgl.drawBufferInfo(gl, vertexArrayInfo, gl.TRIANGLES, vertexArrayInfo.numelements, 0, n_stars);

  }
  {
    twgl.bindFramebufferInfo(gl, null)
    gl.useProgram(processProgramInfo.program);

    gl.clear(gl.COLOR_BUFFER_BIT)

    twgl.setUniforms(processProgramInfo, screenUniforms);
    gl.bindVertexArray(screenVAO)
    gl.drawArrays(gl.TRIANGLES,0,6)
  }

  if(!pause) requestAnimationFrame(draw)
}
const start_draw = () => {
  if(!pause) requestAnimationFrame(draw)
}

const SVG_NS = "http://www.w3.org/2000/svg"

const drawText = (o) => {
  let text = document.createElementNS(SVG_NS, "text");

  o.props["dominant-baseline"] = "middle"
  o.props["text-anchor"] = "middle"

  for (const name in o.props) {
    if (o.props.hasOwnProperty(name)) {
      text.setAttributeNS(null, name, o.props[name]);
    }
  }

  text.textContent = o.text;
  axes.appendChild(text);
  return text
}

const drawLabels = () => {
  const margin = 50
  axes.innerHTML = ""
  drawText({ props: { x: vw/2, y: 0  + margin }, text: "Effective Temperature (Kelvin)" })
  drawText({ props: { x: vw/2, y: vh - margin }, text: "Blue vs Visible Light (B-V Index)" })
  drawText({ props: { x: 0  + margin, y: vh/2, transform: "rotate(-90)" }, text: "Absolute magnitude" })
  drawText({ props: { x: vw - margin, y: vh/2, transform: "rotate(+90)" }, text: "Luminosity in Suns (L⊙)" })

  drawText({ props: { x: 0  + 3*margin, y: 0  + margin }, text: round(max_temp) })
  drawText({ props: { x: vw - 3*margin, y: 0  + margin }, text: round(min_temp) })

  drawText({ props: { x: 0  + 3*margin, y: vh - margin }, text: round(min_bv) })
  drawText({ props: { x: vw - 3*margin, y: vh - margin }, text: round(max_bv) })

  drawText({ props: { x: 0  + margin, y: 0  + 3*margin }, text: round(min_mag) })
  drawText({ props: { x: 0  + margin, y: vh - 3*margin }, text: round(max_mag) })

  drawText({ props: { x: vw - margin, y: 0  + 3*margin }, text: round(max_sol_lum) })
  drawText({ props: { x: vw - margin, y: vh - 3*margin }, text: round(min_sol_lum) })

}
/*
    scales: {
      x: {
        type: 'logarithmic',
        title: { display, text: 'Effective temperature (Kelvins)' },
        position: 'top',
        min: min_temp, max: max_temp,
        reverse: true,
        ticks: { 
          callback: value => classes[value] + "0: " + value,
          minRotation: 30
        },
        afterBuildTicks: axis => axis.ticks = Object.keys(classes).map(v => ({ value: parseInt(v) })),
        grid: { drawOnChartArea: false },
      },
      x1: {
        type: 'linear',
        title: { display, text: 'Blue light versus visible light (B−V index)' },
        position: 'bottom',
        min: max_bv, max: min_bv,
        grid: { drawOnChartArea: true },
      },
      y: {
        type: 'logarithmic',
        title: { display, text: 'Luminosity in Suns (L⊙)' },
        display: true,
        position: 'right',
        ticks: { 
          callback: value => "₁₀"+log10(value).toPrecision(1),
          minRotation: 30
        },
        min: min_sol_lum, max: max_sol_lum,
        grid: { drawOnChartArea: false },
      },
      y1: {
        type: 'linear',
        position: 'left',
        title: { display, text: 'Hipparchus’s scale (Absolute magnitude)' },
        min: max_mag, max: min_mag,
        reverse: true,
        grid: { drawOnChartArea: true },
      },
    }
   */

$time_pause.addEventListener("input", e => { pause = e.target.checked; then = 0; start_draw() })
$time_slider.addEventListener("input", e => time = exp10(parseFloat(e.target.value)) - 1)
$time_number.addEventListener("input", e => time = parseFloat(e.target.value))

const resize = () => {
  vw = window.innerWidth
  vh = window.innerHeight

  vmin = min(vw, vh)
  vmax = max(vw, vh)

  canvas.width = vw
  canvas.height = vh
  axes.setAttribute("viewBox", "0 0 " + vw + " " + vh)

  screenUniforms.u_resolution = [vw, vh]

  gl.viewport(0,0,vw,vh)
  twgl.resizeFramebufferInfo(gl, framebufferInfo)

  drawLabels()
}
window.addEventListener("resize", resize)
resize()
start_draw()
