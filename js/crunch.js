// Probability density function of stars' initial masses
// Kroupa 2001
const initial_mass_function = M => (
  (M < 0.08) ? (M ** -0.3)
  : in_range (0.08, M, 0.5) ? (M ** -1.3)
  : (M ** -2.3)
)

// Zeta function of metallicity Z
const phases = {
  C_MS: { name: "Deeply convective main sequence", index: 0, },
  MS: { name: "Main sequence", index: 1, },
  HG: { name: "Hertzsprung Gap", index: 2, },
  GB: { name: "Giant", index: 3, },
  CHeB: { name: "Core Helium-burning giant", index: 4, },
  EAGB: { 
    index: 5, 
    name: "Early asymptotic giant", 
    description: "Extinct H-burning shell surrounding an H-exhausted core, where degenerate CO is beginning to grow."
  },
  TAPGB: { name: "Thermally pulsating asymptotic giant", index: 6, },
  // He_MS: { name: "Naked Helium Star Main Sequence", index: 7, },
  // He_HG: { name: "Naked Helium Star Hertzsprung Gap", index: 8, },
  // He_GB: { name: "Naked Helium Star Giant Branch", index: 9, },
  // He_WD: { name: "Helium White Dwarf", index: 10, },
  CO_WD: { name: "Carbon/Oxygen white dwarf", index: 11, },
  ONe_WD: { name: "Oxygen/Neon white dwarf", index: 12, },
  NS: { name: "Neutron star", index: 13, },
  BH: { name: "Black hole", index: 14, },
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

class Star {
  id;

  M; Mc;

  X; Y; Z;

  σ; ζ; ρ;

  L; R; T; t; τ; _;

  polynomial;
  from_coefficients;

  constructor(id, M, Z) {
    this.id = id; 

    this.M = { ZAMS: M }; // mass
    this.Mc = { }; // core mass
    
    this.X = 0.76 - 3*Z; // hydrogen abunance (T p.1)
    this.Y = 0.24 + 2*Z; // helium abundance (T p.1)
    this.Z = Z; // metallicity (T p.1)

    this.σ = log10(Z); // log metallicity (H Appendix)
    this.ζ = log10(Z/Z_sun); // relative log metallicity (H Appendix)
    this.ρ = log10(Z/Z_sun) + 1.0;
    
    this.L = { }; // luminosity
    this.R = { }; // radius
    this.T = { }; // temperature
    this.t = { }; // time
    this.τ = { }; // relative time
    this._ = { }; // misc

    this.polynomial = polynomial(this.ζ);
    this.from_coefficients = from_coefficients(this.ζ);

    // (H1, H2, H3)
    // Constant stuff
    {
      // (H1)
      // the initial mass above which a hook appears in the main-sequence
      this.M.hook = 1.0185 + 0.16015*this.ζ + 0.0892*this.ζ*this.ζ

      // (H2)
      // the maximum initial mass for which He ignites degenerately in a helium flash
      this.M.HeF = 1.995 + 0.25*this.ζ + 0.087*this.ζ*this.ζ

      // (H3)
      // the maximum initial mass for which He ignites on the first giant branch
      this.M.FGB = 13.048 * ((Z/0.02)**0.06) / (1 + 0.0012*((0.02/Z)**1.27))

      // (H p.5)
      this.regimes = ({ LM, IM, HM, LM_IM, IM_HM }) => 
        (M < this.M.HeF) ? (LM ?? LM_IM)
        : in_range(this.M.HeF, M, this.M.FGB) ? (IM ?? LM_IM ?? IM_HM)
        : (HM ?? IM_HM)

      // where the mass of the convective envelope MCE first exceeds a set fraction of the envelope mass ME
      this.ratio_CE_E = this.regimes({ LM: 2/5, IM_HM: 1/3 })
    }
    check(this.M.hook)
    check(this.M.HeF)
    check(this.M.FGB)
    check(this.ratio_CE_E)
    
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
    
    const [ aα, aβ, aγ, aδ, aε, aζ, aη ] = this.from_coefficients(
      [ 0.3970417, -0.32913574, 0.34776688, 0.37470851, 0.09011915 ],
      [ 8.527626, -24.41225973, 56.43597107, 37.06152575, 5.4562406 ],
      [ 0.00025546, -0.00123461, -0.00023246, 0.00045519, 0.00016176 ],
      [ 5.432889, -8.62157806, 13.44202049, 14.51584135, 3.39793084 ],
      [ 5.563579, -10.32345224, 19.4432298, 18.97361347, 4.16903097 ],
      [ 0.7886606, -2.90870942, 6.54713531, 4.05606657, 0.53287322 ],
      [ 0.00586685, -0.01704237, 0.03872348, 0.02570041, 0.00383376 ]
    )
    
    const [ aθ, aι, aκ, aλ, aμ, aν, aξ, aο, aπ ] = this.from_coefficients(
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
    
    const [ a1, a2, a3, a4, a5 ] = this.from_coefficients(
      [1.593890e+3, 2.053038e+3, 1.231226e+3, 2.327785e+2],
      [2.706708e+3, 1.483131e+3, 5.772723e+2, 7.411230e+1],
      [1.466143e+2, -1.048442e+2, -6.795374e+1, -1.391127e+1],
      [4.141960e-2, 4.564888e-2, 2.958542e-2, 5.571483e-3],
      [3.426349e-1]
    )

    const [ a6, a7, a8, a9, a10 ] = this.from_coefficients(
      [1.949814e+1, 1.758178e+0, -6.008212e+0, -4.470533e+0],
      [4.903830e+0],
      [5.212154e-2, 3.166411e-2, -2.750074e-3, -2.271549e-3],
      [1.312179e+0, -3.294936e-1, 9.231860e-2, 2.610989e-2],
      [8.073972e-1]
    )
    
    const [ _a11, _a12, a13, a14, a15, a16 ] = this.from_coefficients(
      [1.031538e+0, -2.434480e-1, 7.732821e+0, 6.460705e+0, 1.374484e+0],
      [1.043715e+0, -1.577474e+0, -5.168234e+0, -5.596506e+0, -1.299394e+0],
      [7.859573e+2, -8.542048e+0, -2.642511e+1, -9.585707e+0],
      [3.858911e+3, 2.459681e+3, -7.630093e+1, -3.486057e+2, -4.861703e+1],
      [2.888720e+2, 2.952979e+2, 1.850341e+2, 3.797254e+1],
      [7.196580e0, 5.613746e-1, 3.805871e-1, 8.398728e-2],
    )
    const a11 = _a11 * a14
    const a12 = _a12 * a14

    const [ _a18, _a19, a20, a21, a22, a23, a24, a25, a26 ] = this.from_coefficients(
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
    const a17 = exp10(max(0.097 - 0.1072*(this.σ + 3), max(0.097, min(0.1461, 0.1461 + 0.1237*(this.σ + 2)))))
    const a18 = _a18 * a20
    const a19 = _a19 * a20

  // (H p.25)

    const [ a27, a28, _a29, a30, a31, a32 ] = this.from_coefficients(
      [9.511033e+1, 6.819618e+1, -1.045625e+1, -1.474939e+1],
      [3.113458e+1, 1.012033e+1, -4.650511e+0, -2.463185e+0],
      [1.413057e+0, 4.578814e-1, -6.850581e-2, -5.588658e-2],
      [3.910862e+1, 5.196646e+1, 2.264970e+1, 2.873680e+0],
      [4.597479e+0, -2.855179e-1, 2.709724e-1],
      [6.682518e+0, 2.827718e-1, -7.294429e-2],
    )
    const a29 = _a29 ** a32
    
    const [ a34, a35, a36, a37 ] = this.from_coefficients(
      [1.910302e-1, 1.158624e-1, 3.348990e-2, 2.599706e-3],
      [3.931056e-1, 7.277637e-2, -1.366593e-1, -4.508946e-2],
      [3.267776e-1, 1.204424e-1, 9.988332e-2, 2.455361e-2],
      [5.990212e-1, 5.570264e-2, 6.207626e-2, 1.777283e-2],
    )
    const _a33 = min(1.4, 1.5135 + 0.3769 * this.ζ)
    const a33 = max(0.6355 - 0.4192 * this.ζ, max(1.25, _a33))

    const [ a38, a39, a40, a41, _a42, a43, _a44 ] = this.from_coefficients(
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
    
    const [ a45, a46, a47, a48, _a49, _a50, _a51, _a52, _a53 ] = this.from_coefficients(
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
    const a50 = min(_a50, 0.306 + 0.053 * this.ζ)
    const a51 = min(_a51, 0.3625 + 0.062 * this.ζ)
    const a52 = (Z > 0.01) ? clamp(0.9, _a52, 1.0) : max(_a52, 0.9)
    const a53 = (Z > 0.01) ? clamp(1.0, _a53, 1.1) : max(_a53, 1.0)

    // (H p.26)
    
    const [ a54, a55, a56, _a57 ] = this.from_coefficients(
      [3.855707e-1, -6.104166e-1, 5.676742e+0, 1.060894e+1, 5.284014e+0],
      [3.579064e-1, -6.442936e-1, 5.494644e+0, 1.054952e+1, 5.280991e+0],
      [9.587587e-1, 8.777464e-1, 2.017321e-1],
      [1.5135e+0, 3.7690e-1]
    )
    const a57 = max(0.6355 - 0.4192*this.ζ, clamp(1.25, _a57, 1.4))

    const [ a58, a59, a60, a61, _a62, _a63, __a64, a65, __a66, a67, __a68 ] = this.from_coefficients(
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
    const _a66 = max(__a66, min(1.6, 0.308 - 1.046 * this.ζ))
    const a66 = clamp(0.8, _a66, 0.8 - 2.0*this.ζ)
    const _a68 = max(0.9, min(__a68, 1.0))
    const a68 = min(_a68, a66)
    
    const [ a69, a70, a71, _a72, a73, _a74 ] = this.from_coefficients(
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
    
    const [ _a75, _a76, _a77, _a78, _a79, _a80, _a81 ] = this.from_coefficients(
      [8.109e-1, -6.282e-1],
      [1.192334e-2, 1.083057e-2, 1.230969e+0, 1.551656e+0],
      [-1.668868e-1, 5.818123e-1, -1.105027e+1, -1.668070e+1],
      [7.615495e-1, 1.068243e-1, -2.011333e-1, -9.371415e-2],
      [9.409838e+0, 1.522928e+0],
      [-2.7110e-1, -5.7560e-1, -8.3800e-2],
      [2.4930e+0, 1.1475e+0]
    )
    const a75 = max(clamp(1.0, _a75, 0.6355 - 0.4192*this.ζ), 1.27)
    const a76 = max(_a76, -0.1015564 - 0.2161264*this.ζ - 0.05182516*this.ζ*this.ζ)
    const a77 = clamp(-0.3868776 - 0.5457078*this.ζ - 0.146347*this.ζ*this.ζ, _a77, 0.0)
    const a78 = clamp(0.0, _a78, 7.454 + 9.046*this.ζ)
    const a79 = clamp(2.0, -13.3 - 18.6*this.ζ, _a79)
    const a80 = max(0.0585542, _a80)
    const a81 = clamp(0.4, _a81, 1.5)

    const [ _b1, _b4, b5, _b6, b7 ] = this.from_coefficients(
      [3.9700e-1, 2.8826e-1, 5.2930e-1],
      [9.960283e-1, 8.164393e-1, 2.383830e+0, 2.223436e+0, 8.638115e-1],
      [2.561062e-1, 7.072646e-2, -5.444596e-2, -5.798167e-2, -1.349129e-2],
      [1.157338e+0, 1.467883e+0, 4.299661e+0, 3.130500e+0, 6.992080e-1],
      [4.022765e-1, 3.050010e-1, 9.962137e-1, 7.914079e-1, 1.728098e-1]
    )
    const b1 = min(0.54, _b1)
    const b2 = clamp(-0.04167 + 55.67*Z, exp10(-4.6739 - 0.9394*this.σ), 0.4771 - 9329.21*(Z**2.94))
    const _b3 = exp10(max(-0.1451, -2.2794 - 1.5175*this.σ - 0.254*this.σ*this.σ))
    const b3 = (Z > 0.004) ? max(_b3, 0.7307 + 14265.1 * (Z**3.395)) : _b3
    const b4 = _b4 + 0.1231572 * (this.ζ**5)
    const b6 = _b6 + 0.01640687 * (this.ζ**5)
    
    const b8 = NaN

    const [ b9, b10, _b11, b12, _b13 ] = this.from_coefficients(
      [2.751631e+3, 3.557098e+2],
      [-3.820831e-2, 5.872664e-2],
      [1.071738e+2, -8.970339e+1, -3.949739e+1],
      [7.348793e+2, -1.531020e+2, -3.793700e+1],
      [9.219293e+0, -2.005865e+0, -5.561309]
    )
    const b11 = _b11*_b11
    const b13 = _b13*_b13
    
    const [ _b14, b15, _b16 ] = this.from_coefficients(
      [2.917412e+0, 1.575290e+0, 5.751814e-1],
      [3.629118e+0, -9.112722e-1, 1.042291e+0],
      [4.916389e+0, 2.862149e+0, 7.84485]
    )
    const b14 = _b14**b15
    const b16 = _b16**b15
    const b17 = (this.ζ > -1.0) ? (1.0 - 0.3880523 * ((this.ζ + 1.0)**2.862149)) : 1.0
    
    // (H p.28)
    
    const [ b18, b19, b20, b21, b22, b23 ] = this.from_coefficients(
      [5.496045e+1, -1.289968e+1, 6.385758e+0],
      [1.832694e+0, -5.766608e-2, 5.696128e-2],
      [1.211104e+2],
      [2.214088e+2, 2.187113e+2, 1.170177e+1, -2.635340e+1],
      [2.063983e+0, 7.363827e-1, 2.654323e-1, -6.140719e-2],
      [2.003160e+0, 9.388871e-1, 9.656450e-1],
    )

    const [ _b24, b25, _b27, b28 ] = this.from_coefficients(
      [1.609901e+1, 7.391573e+0, 2.277010e+1, 8.334227e+0],
      [1.747500e-1, 6.271202e-2, -2.324229e-2, -1.844559e-2],
      [2.752869e+0, 2.729201e-2, 4.996927e-1, 2.496551e-1],
      [3.518506e+0, 1.112440e+0, -4.556216e-1, -2.179426e-1],
    )
    const b24 = _b24**b28
    const b26 = 5.0 - 0.09138012 * (Z**-0.3671407)
    const b27 = _b27**(2*b28)

    const [ b29, b30, _b31, b32, b33, _b34 ] = this.from_coefficients(
      [1.626062e+2, -1.168838e+1, -5.498343e+0],
      [3.336833e-1, -1.458043e-1, -2.011751e-2],
      [7.425137e+1, 1.790236e+1, 3.033910e+1, 1.018259e+1],
      [9.268325e+2, -9.739859e+1, -7.702152e+1, -3.158268e+1],
      [2.474401e+0, 3.892972e-1],
      [1.127018e+1, 1.622158e+0, -1.443664e+0, -9.474699e-1],
    )
    const b31 = _b31 ** b33
    const b34 = _b34 ** b33

    const [ _b36, _b37, _b38 ] = this.from_coefficients(
      [1.445216e-1, -6.180219e-2, 3.093878e-2, 1.567090e-2],
      [1.304129e+0, 1.395919e-1, 4.142455e-3, -9.732503e-3],
      [5.114149e-1, -1.160850e-2]
    )
    const b36 = _b36 ** 4
    const b37 = 4.0 * _b37
    const b38 = _b38 ** 4
    
    const [ b39, _b40, _b41, b42, b43, _b44 ] = this.from_coefficients(
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
    const b45 = (this.ρ < 0.0) ? 1.0 : 1.0 - ( 2.47162*this.ρ - 5.401682*(this.ρ**2) + 3.2473613*(this.ρ**3) )
    const b46 = -1.0 * _b46 * log10(this.M.HeF / this.M.FGB)
    const b47 = 1.127733*this.ρ + 0.2344416*(this.ρ**2) - 0.3793726*(this.ρ**3)
    
    const [ _b51, b52, _b53, b54, _b55, _b56, _b57 ] = this.from_coefficients(
      [1.125124e+0, 1.306486e+0, 3.622359e+0, 2.601976e+0, 3.031270e-1],
      [3.349489e-1, 4.531269e-3, 1.131793e-1, 2.300156e-1, 7.632745e-2],
      [1.467794e+0, 2.798142e+0, 9.455580e+0, 8.963904e+0, 3.339719e+0],
      [4.658512e-1, 2.597451e-1, 9.048179e-1, 7.394505e-1, 1.607092e-1],
      [1.0422e+0, 1.3156e-1, 4.5000e-2],
      [1.110866e+0, 9.623856e-1, 2.735487e+0, 2.445602e+0, 8.826352e-1],
      [-1.584333e-1, -1.728865e-1, -4.461431e-1, -3.925259e-1, -1.276203e-1]
    )
    const b51 = _b51 - 0.134379 * (this.ζ ** 5)
    const b53 = _b53 - 0.4426929 * (this.ζ ** 5)
    const b55 = min(_b55, 0.99164 - 743.123*(Z**2.83))
    const b56 = _b56 + 0.1140142 * (this.ζ ** 5)
    const b57 = _b57 - 0.01308728 * (this.ζ ** 5)
      
    // END COEFFICIENTS
      
    this.fit = fit(this.M.ZAMS)
    this.lerp = lerp(this.M.ZAMS)
    
    // Zero-age main sequence mass and radius
    
    // (T1)
    {
      this.L.ZAMS = this.fit
      ([aα, 5.5], [aβ, 11])
      ([aγ, 0], [1, 3], [aδ, 5], [aε, 7], [aζ, 8], [aη, 9.5])
    }
    check(this.L.ZAMS)
    
    // (T2)
    {
      this.R.ZAMS = this.fit
      ([aθ, 2.5], [aι, 6.5], [aκ, 11], [aλ, 19], [aμ, 19.5])
      ([aν, 0], [aξ, 2], [aο, 8.5], [1, 18.5], [aπ, 19.5])
    }
    check(this.R.ZAMS)
    
    
    // [5.1] Main-sequence and Hertzsprung gap
    

    // (H66)
    {
      this.Mc.BAGB = (b36 * (M**b37) + b38) ** (1/4)
    }
    check(this.Mc.BAGB)
    
    // (H4, H5, H6, H7)
    {
      this.t.BGB = this.fit
      ([a1, 0], [a2, 4], [a3, 5.5], [1, 7])
      ([a4, 2], [a5, 7])

      // (H7)
      const µ = max(0.5, 1 - 0.01 * max(a6 / (M**a7), a8 + a9/(M**a10)))
      
      this.t.hook = µ * this.t.BGB
      
      // (H6)
      const x = max(0.95, min(0.95 - 0.03*(this.ζ + 0.30103), 0.99))
      
      // (H5)
      this.t.MS = max(this.t.hook, x * this.t.BGB)
    }
    check(this.t.BGB)
    check(this.t.hook)
    check(this.t.MS)
    
    // (H8)
    {
      this.L.TMS = this.fit
      ([a11, 3], [a12, 4], [a13, a16 + 1.8])
      ([a14, 0], [a15, 5], [1, a16])
    }
    check(this.L.TMS)
    
    // (H9)
    {
      const c1 = -8.672073e-2
      const M_star = a17 + 0.1

      this.R.TMS = this.lerp(a17, M_star) (
        fit (max(M, a17)) ([a18, 0], [a19, a21]) ([a20, 0], [1, a22]),
        fit (min(M_star, M)) ([c1, 3], [a23, a26], [a24, a26+1.5]) ([a25, 0], [1, 5])
      )

      if(M < 0.5) this.R.TMS = max(this.R.TMS, 1.5*this.R.ZAMS)
    }
    check(this.R.TMS)
    
    // (H10)
    {
      const c2 = 9.301992
      const c3 = 4.637345
      
      this.L.BGB_ = ({ M }) => fit(M)
        ([a27, a31], [a28, c2])
        ([a29, 0], [a30, c3], [1, a32])
      this.L.BGB = this.L.BGB_({ M })
    }
    check(this.L.BGB)

     // (H18)
    this.η = (Z > 0.0009 || M < 10) ? 10 : 20
    check(this.η)

    
    // (H16)
    {
      const L_ = ({ M }) => min(a34 / (M**a35), a36 / (M**a37))
      
      this.L.Δ = ( M < this.M.hook ) ? 0
      : in_range(this.M.hook, M, a33) ? L_({ M: a33 })*(((M - this.M.hook)/(a33 - this.M.hook))**0.4)
      : ( M > a33 ) ? L_({ M })
      : NaN
    }
    check(this.L.Δ)
    
    // (H17)
    {
      
      const B = ({ M }) => fit(M)([a38, 0], [a39, 3.5])([a40, 3], [1, a41]) - 1

      this.R.Δ = ( M < this.M.hook ) ? 0
      : in_range(this.M.hook, M, a42) ? a43 * sqrt((M - this.M.hook)/(a42 - this.M.hook))
      : in_range(a42, M, 2.0) ? a43 + (B({ M: 2.0 }) - a43)*(((M-a42)/(2-a42))**a44)
      : ( M > 2.0 ) ? B({ M })
      : NaN
    }
    check(this.R.Δ)
    
    // (H19)
    {
      
      const B = ({ M }) => fit(M)([a45, 0], [a46, a48])([1, 0.4], [a47, 1.9])
      
      this.L.α = ( M < 0.5) ? a49
      : in_range(0.5, M, 0.7) ? a49 + 5.0*(0.3 - a49)*(M - 0.5)
      : in_range(0.7, M, a52) ? 0.3 + (a50 - 0.3)*(M - 0.7)/(a52 - 0.7)
      : in_range(a52, M, a53) ? a50 + (a51 - a50)*(M - a52)/(a53 - a52)
      : in_range(a53, M, 2.0) ? a51 + (B({ M: 2.0 }) - a51)*(M - a53)/(2.0 - a53)
      : ( M > 2.0 ) ? B({ M })
      : NaN
    }
    check(this.L.α)
    
    // (H20)
    {
      const B = ({ M }) => max(0.0, a54 - a55*(M**a56))
      this.L.β = (M > a57 && B({ M }) > 0.0) 
      ? max(0.0, B({ M: a57 }) - 10.0*B({ M: a57 })*(M-a57))
      : B({ M })
    }
    check(this.L.β)
    
    // (H21)
    {        
      const B = ({ M }) => fit(M)([a58, a60])([a59, a61])
      const a64 = (_a68 > a66) ? B({ M: a66 }) : _a64
      
      this.R.α = in_range(a66, M, a67) ? B({ M })
      : (M < 0.5) ? a62
      : in_range(0.5, M, 0.65) ? a62 + (a63-a62)*(M-0.5) / 0.15
      : in_range(0.65, M, a68) ? a63 + (a64-a63)*(M-0.65) / (a68 - 0.65)
      : in_range(a68, M, a66) ? a64 + (B({ M: a66 }) - a64)*(M - a68) / (a66 - a68)
      : (M > a67) ? B({ M: a67 }) + a65*(M - a67)
      : NaN
    }
    check(this.R.α)
    
    // (H22)
    {
      
      const B = ({ M }) => fit(M)([a69, 3.5])([a70, 0], [1, a71])
      const _β = (M < 1.0) ? 1.06
      : in_range(1.0, M, a74) ? 1.06 + (a72 - 1.06)*(M - 1.0)/(a74 - 1.06)
      : in_range(a74, M, 2.0) ? a74 + (B({ M: 2.0 }) - a72)*(M - a74)/(2.0 - a74)
      : in_range(2.0, M, 16.0) ? B({ M })
      : (M > 16.0) ? B({ M: 16.0 }) + a73*(M - 16.0)
      : NaN
      this.R.β = 1 - _β
    }
    check(this.R.β)
    
    // (H23)
    {
      const B = ({ M }) => a76 + a77*((M-a78)**a79)
      const C = (a75 < 1.0) ? C = B({ M: 1.0 }) : a80
      this.R.γ = (M > a75 + 0.1) ? 0.0
      : (M <= 1.0) ? B({ M })
      : in_range(1.0, M, a75) ? B({ M: 1.0 }) + (a80 - B({ M: 1.0 }))*(((M-1.0)/(a75-1.0))**a81)
      : in_range(a75, M, a75+1.0) ? C - 10.0*(M-a75)*C
      : NaN
    }
    check(this.R.γ)
    
    // (H11, H12, H13, H14, H15, H24)
    {
      // (H11)
      this.τ.MS_ = ({ t }) => t / this.t.MS

      // (H12)
      this.L.MS_ = ({ τ, τ1, τ2 }) => this.L.ZAMS * exp10(
        this.L.α*(τ) 
        + this.L.β*(τ**this.η)
        + (log10(this.L.TMS/this.L.ZAMS) - this.L.α - this.L.β)*(τ*τ)
        - this.L.Δ*(τ1*τ1 - τ2*τ2)
      )

      // (H13, H24)
      this.R.MS_ = ({ τ, τ1, τ2 }) => max(
        this.R.ZAMS * exp10(
          this.R.α*(τ) 
          + this.R.β*(τ**10)
          + this.R.γ*(τ**40)
          + (log10(this.R.TMS/this.R.ZAMS) - this.R.α - this.R.β - this.R.γ)*(τ*τ*τ)
          - this.R.Δ*(τ1*τ1*τ1 - τ2*τ2*τ2)
        ), 
        0.0258 * ((1.0 + this.X)**(5/3)) * (M**(-1/3))
      )
      
      const ε = 0.01

      // (H14)
      this.τ.MS_1_ = ({ t }) => min(1.0, t/this.t.hook)

      // (H15)
      this.τ.MS_2_ = ({ t }) => clamp(0.0, (t - (1.0 - ε)*this.t.hook)/(ε * this.t.hook), 1.0)
    }

    // (H46)
    {
      const A = min(b4 * (M**-b5), b6 * (M**-b7))
      this.R.GB_ = ({ L }) => 
        A * (L**b1 + b2*(L**b3))
    }
    
    // (H74)
    {   
      const M1 = this.M.HeF - 0.2
      const M2 = this.M.HeF
      const A1_ = ({ M }) => b56 + b57*M
      const A2_ = ({ M }) => min(b51 * (M**-b52), b53 * (M**-b54))
      this.R.AGB_ = ({ L }) => this.lerp(M1, M2)( 
        A1_({ M: max(M1, M) }) * ((L**b1) + b2*(L**(b55*b3))), 
        A2_({ M: min(M, M2) }) * ((L**b1) + b2*(L**b3)), 
      )
    }


    // (H77, H78)
    {
      // (H77)
      this.L.ZHe_ = ({ M }) => this.fit
        ([15262, 10.25])
        ([1, 9], [29.54, 7.5], [31.18, 6], [0.0469, 0])
      this.L.ZHe = this.L.ZHe_({ M })
      
      // (H78)
      this.R.ZHe_ = ({ M }) => this.fit
        ([0.2391, 4.6])
        ([1, 4], [0.162, 3], [0.0065, 0])
      this.R.ZHe = this.R.ZHe_({ M })
    }
    check(this.L.ZHe)
    check(this.R.ZHe)
    
    // (H79)
    {
      this.t.HeMS_ = ({ M }) => fit(M)
        ([0.4129, 0], [18.81, 4], [1.853, 6])
        ([1, 6.5])
      this.t.HeMS = this.t.HeMS_({ M })
    }

     // (H49, H50)
    {
      
      const B = ({ M }) => fit(M)([b11, 0], [b12, 3.8])([b13, 0], [1, 2])
      const α1 = (b9*(this.M.HeF**b10) - B({ M: this.M.HeF })) / B({ M: this.M.HeF })
      
      // (H49)
      this.L.HeI_ = ({ M }) => this.regimes({
        LM: (b9 * (M**b10)) / (1 + α1*exp(15*(M - this.M.HeF))),
        IM_HM: B({ M })
      })
      this.L.HeI = this.L.HeI_({ M })
      
      // (H50b)
      const µ = log10(M/12.0) / log10(this.M.FGB/12.0)

      // (H50a)
      this.R.HeI_ = ({ Mc }) => (M < this.M.FGB) ? this.R.GB_({ L: this.L.HeI })
      : (M > max(this.M.FGB, 12.0)) ? this.R.mHe_({ Mc })
      : in_range(this.M.FGB, M, 12.0) ? this.R.mHe * ((this.R.GB_({ L: this.L.HeI }) / this.R.mHe_({ Mc })) ** µ)
      : NaN

      // (H p.6)
      this.L.EHG = (M < this.M.FGB) ? this.L.BGB : this.L.HeI
      this.R.EHG_ = ({ Mc }) => (M < this.M.FGB) ? this.R.GB_({ L: this.L.BGB }) : this.R.HeI_({ Mc })
    }
    check(this.L.HeI)
    check(this.L.EHG)
    
    // (H51)
    { 
      const c = b17/(this.M.FGB**0.1) + (b16*b17 - b14)/(this.M.FGB**(b15 + 0.1))
      this.L.min_He_ = ({ M }) => this.L.HeI * fit(M)
        ([b14, 0], [c, b15+0.1])
        ([b16, 0], [1, b15])
      this.L.min_He = this.L.min_He_({ M })
    }
    check(this.L.min_He)
    
    // (H52, H53, H54, H55)
    {
      const µ_ = ({ Mc }) => (M - Mc)/(this.M.HeF - Mc)
      
      // (H53)
      const α2_ = ({ Mc }) => 
        (b18 + this.L.ZHe_({ M: Mc }) 
        - this.L.min_He_({ M })) 
        / (this.L.min_He_({ M: this.M.HeF }) - this.L.ZHe_({ M: Mc }))
      
      this.L.ZAHB_ = ({ M = this.M.ZAMS, Mc } = {}) => this.L.ZHe_({ Mc }) 
        + ((1 + b20) / (1 + b20*(µ_({ Mc })**1.6479)))
        * (b18 * (µ_({ Mc })**b19)) / (1 + α2_({ Mc }) * exp(15 * (M - this.M.HeF)))

      // (H54)
      const f_ = ({ Mc }) => 
        ( (1.0 + b21) * (µ_({ Mc }) ** b22) ) 
        / ( 1.0 + b21 * (µ_({ Mc }) ** b23) )
        
      this.R.ZAHB_ = ({ Mc }) => 
        mix(this.R.GB_({ L: this.L.ZAHB }), this.R.ZHe_({ Mc }))(f_({ Mc }))
      
      const R_ = ({ M }) => fit(M)
        ([b24, 1], [b25**b26, b26+b28])
        ([b27, 0], [1, b28])
        
      const R1 = R_({ M })
      const R2_ = ({ Mc }) => this.R.GB_({ L: this.L.ZAHB_({ Mc }) })
        *((R_({ M: this.M.HeF }) / this.R.GB_({ L: this.L.ZAHB_({ M: this.M.HeF, Mc }) })) ** µ_({ Mc }))

      // (H55)
      this.R.mHe_ = ({ Mc }) => (M > this.M.HeF) ? R1 : R2_({ Mc })
      
      
      const L_ = ({ M }) => fit(M)
        ([b31, 0], [b32, b33+1.8])
        ([b34, 0], [1, b33])
        
      const α3 = 
        ( b29 * (this.M.HeF**b30) - L_({ M: this.M.HeF }) ) 
        / L_({ M: this.M.HeF })
      
      // (H56)
      this.L.BAGB = (M > this.M.HeF) ? L_({ M })
      : (b29 * (M**b30)) / (1 + α3 * exp(15 * M - this.M.HeF))
      
      this.R.BAGB = this.R.AGB_({ L: this.L.BAGB })
      
      const t_ = ({ M }) => this.t.BGB * fit(M)
        ([b41, b42], [b43, 5])
        ([b44, 0], [1, 5])
        
      const α4 = (t_({ M: this.M.HeF }) - b39)/b39

      // (H57)
      this.t.He_ = ({ Mc }) => this.regimes({
        LM: (b39 + (this.t.HeMS_({ M: Mc }) - b39) * ((1 - µ_({ Mc }))**b40))
          * (1 + α4*exp(15 * (M - this.M.HeF))),
        IM_HM: t_({ M })
      })
    }
    check(this.L.BAGB)
    check(this.R.BAGB)
    
    // (H p.10)
    // (H34, H37, H38, H39, H40, H41, H42, H43)
    {
      const F = this.lerp(this.M.HeF, 2.5)
      const p = F(6, 5)
      const q = F(3, 2)
      const B = max(3e+4, 500 + 1.75e+4 * (M**0.6))
      const D0 = 5.37 * 0.135 * this.ζ
      const D = exp10(F(
        D0, max(-1.0, max(0.975*D0 - 0.18*M, 0.5*D0 - 0.06*M))
      ))
      
      // (H31)
      this.Mc.L_ = ({ L }) => (L/D) ** (1/p)
      
      // (H37)
      this.L.Mc_ = ({ Mc }) => min(B * (Mc**q), D * (Mc**p))

      this.general_giant = ({ A, ta, La, Lb, _t_inf_2}) => {
      
        // (H34)
        const Mc__ = ({ p, D, t_inf, t }) =>
          ( (p-1) * A * D * (t_inf - t) ) ** ( 1 / (1-p) )

        // (H38)
        // crossover point
        const Mx = (B/D)**(1/(p - q))    
        const Lx = this.L.Mc_({ Mc: Mx })
      
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
      const { L_, Mc_, t } = this.general_giant({
        A: A_H, ta: this.t.BGB, 
        La: this.L.BGB, Lb: this.L.HeI
      })
      
      this.L.GB_ = ({ t }) => L_({ t })
      this.Mc.GB__ = ({ t }) => Mc_({ t })
      this.t.HeI = t
    }
    check(this.t.HeI)
    
    // (H44)
    {
      const c1 = 9.20925e-5
      const c2 = 5.402216
      const C_BCB = (this.Mc.L_({ L: this.L.BGB_({ M: this.M.HeF }) }) ** 4) 
        - c1*(this.M.HeF ** c2)

      // (H44)
      this.Mc.BGB = min(
        0.95 * this.Mc.BAGB, 
        ( C_BCB + c1*(M**c2) ) ** (1/4)
      )

      const C_HeI = (this.Mc.L_({ L: this.L.HeI_({ M: this.M.HeF }) }) ** 4) - c1*(this.M.HeF ** c2)

      // (H p.13)
      this.Mc.HeI = this.regimes({
        LM: this.Mc.L_({ L: this.L.HeI }),
        IM_HM: ( C_HeI + c1*(M**c2) ) ** (1/4)
      })
    }
    check(this.Mc.HeI)
    
    // (H25, H26, H27, H28, H29, H30) 
    {
      // (H25)
      this.τ.HG_ = ({ t }) => (t - this.t.MS) / (this.t.BGB - this.t.MS)
      
      // (H26)
      this.L.HG_ = ({ τ }) => this.L.TMS * ((this.L.EHG / this.L.TMS) ** τ)

      // (H27)
      this.R.HG_ = ({ Mc, τ }) => this.R.TMS * ((this.R.EHG_({ Mc }) / this.R.TMS) ** τ)
      this.Mc.MS = 0.0
      
      // (H28)
      this.Mc.EHG =  this.regimes({
        LM: this.Mc.BGB, // this.Mc.GB
        IM: this.Mc.BGB,
        HM: this.Mc.HeI
      })
      
      // (H29)
      const ρ = (1.586 + (M**5.25)) / (2.434 + 1.02*(M**5.25))
      this.Mc.TMS = ρ * this.Mc.EHG

      // (H30)
      this.Mc.HG_ = ({ τ }) => ((1-τ)*ρ + τ) * this.Mc.EHG
    }
    check(this.Mc.EHG)
    check(this.Mc.TMS)
    
    // [5.2] First giant branch
    
    
    // (H45)
    {
      // (H p.11)
      this.τ.GB_ = ({ t }) => (t - this.t.BGB) / (this.t.HeI - this.t.BGB)
      
      // (H45)
      this.Mc.GB_ = ({ t, τ }) => (M > this.M.HeF) ? this.Mc.BGB + (this.Mc.HeI - this.Mc.BGB) * τ
      : this.Mc.GB__({ t })
    }
    
    // [5.3] Core helium burning
    
    // (H58, H59, H60)
    {
      this.τ.CHeB_ = ({ t }) => (t - this.t.HeI) / this.t.He_({ Mc: this.Mc.HeI })
     
      // (H58c)
      // original formulation raised a negative number to a fraction.
      // merged that part directly to H58b to avoid NaN issues
      const α_bl = (1 - b45*((this.M.HeF/this.M.FGB)**0.414)) 
      
      // (H58b)
      const f_bl_ = ({ M }) => 
        (M**b48) 
        * ((1 - this.R.mHe_({ M })/this.R.AGB_({ L: this.L.HeI })) ** b49)
      const f_bl = f_bl_({ M })

      // (H58a)
      const τ_bl = this.regimes({
        LM: 1.0,
        IM: b45*((M/this.M.FGB)**0.414) + α_bl*(( ln(M/this.M.FGB) / ln(this.M.HeF/this.M.FGB) )**b46),
        HM: (1-b47) * f_bl_({ M }) / f_bl_({ M: this.M.FGB })
      })
      
      // (H p.12)
      const τx = this.regimes({ LM: 0, IM: 1 - τ_bl, HM: 0 })
      
      // (H59)
      const Lx_ = ({ Mc }) => this.regimes({
        LM: this.L.ZAHB_({ Mc }),
        IM: this.L.min_He,
        HM: this.L.HeI
      })

      // (H60)
      const Rx_ = ({ Mc }) => this.regimes({
        LM: this.R.ZAHB_({ Mc }),
        IM: this.R.GB_({ L: this.L.min_He }),
        HM: this.R.HeI_({ Mc })
      })
      
      // (H62b)
      const ξ_ = ({ Mc }) => min(2.5, max(0.4, this.R.mHe_({ Mc }) / Rx_({ Mc })))
      
      // (H62)
      const λ_ = ({ Mc, τ }) => ((τ - τx) / (1 - τx)) ** ξ_({ Mc })
      
      // (H63)
      const _λ_ = ({ Mc, τ }) => ((τx - τ) / τx) ** 3
      
      // (H61)
      this.L.CHeB_ = ({ Mc, τ }) => 
        in_range(τx, τ, 1) 
        ? Lx_({ Mc }) * ((this.L.BAGB/Lx_({ Mc })) ** λ_({ Mc, τ })) 
        : Lx_({ Mc }) * ((this.L.HeI/Lx_({ Mc })) ** _λ_({ Mc, τ }))
      
      const Rmin_ = ({ Mc }) => min(this.R.mHe_({ Mc }), Rx_({ Mc }))
      
      const τy = this.regimes({ LM_IM: 1, HM: τ_bl })
      const Ly = this.regimes({ LM_IM: this.L.BAGB, HM: NaN })
      const Ry = this.R.AGB_({ L: Ly })
      
      // (H65)
      const ρ_ = ({ Mc, τ }) => 
        (ln(Ry / Rmin_({ Mc })) ** (1/3)) * ((τ-τx)/(τy - τx))
        - (ln(Rx_({ Mc }) / Rmin_({ Mc })) ** (1/3)) * ((τy - τ)/(τy - τx))
      
      // (H64)
      this.R.CHeB_ = ({ Mc, τ }) => this.R.GB_({ L: this.L.CHeB_({ Mc, τ }) })
      /*
        in_range(0, τ, τx) ? this.R.GB_({ L: this.L.CHeB_({ Mc, τ }) })
        : in_range(τy, τ, 1) ? this.R.AGB_({ L: this.L.CHeB_({ Mc, τ }) })
        : in_range(τx, τ, τy) ? Rmin_({ Mc }) * exp(abs(ρ_({ Mc, τ })) ** 3)
        : NaN
        */
     
      // (H67)
      this.Mc.CHeB_ = ({ τ }) => mix(this.Mc.HeI, this.Mc.BAGB)(τ)
    }
    
    {
      // (H p.13)
      this.t.BAGB = this.t.HeI + this.t.He_({ Mc: this.Mc.BAGB })
    }
    
    // (H69, H70)
    { 
      // (H69)
      this.Mc.DU = 0.44 * this.Mc.BAGB + 0.448
      this.L.DU = this.L.Mc_({ Mc: this.Mc.DU })
      
      const { L_, Mc_, t } = this.general_giant({
        A: A_He, ta: this.t.BAGB, 
        La: this.L.BAGB, Lb: this.L.DU
      })
      
      this.L.EAGB_ = ({ t }) => L_({ t })
      this.Mc.EAGB_ = ({ t }) => Mc_({ t })
      this.t.DU = t
    }
    
    {
      // (H73)
      const λ = min(0.9, 0.3 + 0.001*(M**5))

      // (H72)
      const t_inf_2 = ({ B, q }) => this.t.DU
        + 1/((q-1) * A_H_He * B)
        * ((B/this.L.DU) ** ((q-1)/q))
        
      const { L_, Mc_, t } = this.general_giant({
        A: A_H_He, ta: this.t.DU, 
        La: this.L.DU, Lb: this.L.DU,
        _t_inf_2: t_inf_2
      })
      this.L.TPAGB_ = ({ t }) => L_({ t })
      this.Mc.TPAGB_ = ({ t }) => this.Mc.DU + (1-λ) * (Mc_({ t }) - this.Mc.DU)
      this.t.SN = t
    }
    
    // (H75)
    {
      this.Mc.SN = max(M_chandra, 0.773 * this.Mc.BAGB - 0.35)
    }
   
    this.bubble = {
      day: 0,
    }
    this.color = ""
  }

  update(t) {
    this.phase = in_range(0, t, this.t.MS) ? (this.M < 0.7 ? phases.C_MS : phases.MS)
    : in_range(this.t.MS, t, this.t.BGB) ? phases.HG
    : in_range(this.t.BGB, t, this.t.HeI) ? phases.GB
    : in_range(this.t.HeI, t, this.t.BAGB) ? phases.CHeB
    : in_range(this.t.BAGB, t, this.t.DU) ? phases.EAGB
    : ( t > this.t.DU && this.Mc.CO < this.Mc.SN ) ? phases.TPAGB
    : (this.Mc.CO > this.Mc.SN) ? ( (this.Mc.SN > 7.0) ? phases.BH : phases.NS )
    : ( (this.Mc.BAGB < 1.6) ? phases.CO_WD : phases.ONe_WD )
    
   // relative time
    
    switch(this.phase){
      // Main sequence
      case phases.C_MS:
      case phases.MS: {
        const τ = this.τ.MS_({ t })
        const τ1 = this.τ.MS_1_({ t })
        const τ2 = this.τ.MS_2_({ t })
        
        const L = this.L.MS_({ τ, τ1, τ2 })
        const R = this.R.MS_({ τ, τ1, τ2 })

        this.L.now = L
        this.R.now = R
        this.border = "white"
        break
      }
      // Hertzsprung gap
      case phases.HG: {
        const τ = this.τ.HG_({ t })
        
        const Mc = this.Mc.HG_({ τ })
        
        const L = this.L.HG_({ τ })
        const R = this.R.HG_({ Mc, τ })
        
        this.L.now = L
        this.R.now = R
        this.border = "hotpink"      
        //console.log("HG", Mc, L,R)
        break
      }
      // Giant branch
      case phases.GB: {
        const τ = this.τ.GB_({ t })
        
        const Mc = this.Mc.GB_({ t, τ })

        const L = this.L.GB_({ t })
        const R = this.R.GB_({ L })  

        this.R.now = R
        this.L.now = L
        this.border = "gold"
        //console.log("GB", Mc, L,R)
        break
      }
      // Helium burning
      case phases.CHeB: {
        const τ = this.τ.CHeB_({ t })
        
        const Mc = this.Mc.CHeB_({ τ })
        
        const L = this.L.CHeB_({ Mc, τ })
        const R = this.R.CHeB_({ Mc, τ })

        this.L.now = L
        this.R.now = R

        this.border = "red"

        //console.log("CHeB", { τ, Mc, L,R })
        break
      }
      // Early AGB
      case phases.EAGB: {
        const Mc = this.Mc.EAGB_({ t })

        const L = this.L.EAGB_({ t })
        const R = this.R.AGB_({ L })  
        
        this.R.now = R
        this.L.now = L
        this.border = "aquamarine"
        
        // console.log("EAGB", Mc, L,R)
        break
      }
      // Thermal pulsating AGB
      case phases.TPAGB: {
        const Mc = this.Mc.TPAGB_({ t })

        const L = this.L.TPAGB_({ t })
        const R = this.R.AGB_({ L })  
        
        this.R.now = R
        this.L.now = L
        this.border = "cornflowerblue"
        
        // console.log("TPAGB", Mc, L,R)
        break
      }
      // Supernova
      case phases.SN: {
        this.R.now = 1
        this.border = "mediumpurple"
        break
      }
      // Black hole
      case phases.BH: {
        this.R.now = 10
        this.L.now = 0
        this.border = "black"
        break
      }
      // Neutron star
      case phases.NS: {
        this.R.now = 0.2
        this.border = "blue"
        break
      }
      // CO white dwarf
      case phases.CO_WD: {
        this.R.now = 0.1
        this.border = "white"
        break
      }
      // ONe white dwarf
      case phases.ONe_WD: {
        this.R.now = 0.1
        this.border = "white"
        break
      }
      // no remnant
      case phases.R: {
        this.R.now = 0.1
        this.L.now = 0
        this.border = "black"
        break
      }
    }
    if(this.phase.index < 15) {
      //console.log(JSON.stringify($,"",2))
      //console.log(phase)
    }
   
    this.T.now = radius_lum_to_temp(this.R.now, this.L.now)
    this.opacity = clamp(0.1, 100/this.R.now, 1)

    this.bubble.T = this.T.now
    this.bubble.L = this.L.now
    this.bubble.R = this.R.now
    this.bubble.M = this.M.ZAMS.toPrecision(2)

    this.bubble.x = to_11(max_temp, min_temp)(this.bubble.T)
    this.bubble.y = to_11(log10(min_sol_lum), log10(max_sol_lum))(log10(this.bubble.L))
    this.bubble.r = this.bubble.R * 0.01

    this.bubble.color = temp_to_rgb(this.T.now)
    this.bubble.limbColor = temp_to_rgb(this.T.now*0.5) // limbColor darkening
  }
}

export const stars_init = () => {
  for(let i = 0; i < n_stars;){
    const mass = random_range(min_mass, max_mass)
    
    // Reject unlikely masses
    const test_mass = random_range(min_mass, max_mass)
    if(initial_mass_function(mass) < initial_mass_function(test_mass)) continue
    
    const metallicity = random_range(min_metal, max_metal)
    
    stars[i] = new Star(i, mass, metallicity)
    stars[i].update(0)
    i++
  }
}

