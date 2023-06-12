import * as twgl from "./twgl-full.module.js"
const m4 = twgl.m4
const v3 = twgl.v3

import { stars_init, star_update } from "./crunch.js"

let ww, wh, vw, vh, aspect

const $main = document.getElementById("main")
const $aside = document.getElementById("aside")

const $canvas = document.getElementById("canvas")
const $axes = document.getElementById("axes")
const $board = document.getElementById("board")

const $info = document.getElementById("info")
let info_star = undefined

const gl = $canvas.getContext("webgl2")

const $fullscreen = document.getElementById("fullscreen")
const $restart = document.getElementById("restart")
const $time_pause = document.getElementById("time-pause")
const $time_slider = document.getElementById("time-slider")
const $time_number = document.getElementById("time-number")
const $quality_select = document.getElementById("quality-select")
let pause = false
let fullscreen = false
let time = 0
let then = 0
let quality = 1
const stats = new Stats()
stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
$main.appendChild( stats.dom )

// init

const surface_vs = `#version 300 es

uniform mat4 u_viewProjection;
uniform float u_time;

in vec4 a_position;
in vec2 a_texcoord;
in vec3 a_normal;

in float a_instanceID;
in float a_instanceRadius;
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

  float radius = a_instanceRadius * (1.0 + 0.2*voronoise(8.0*a_normal + 100.0*v_id));
  vec4 surfacePosition = vec4(a_normal * radius, 1.0);
  vec4 worldPosition = a_instancePosition * surfacePosition;
  v_position = u_viewProjection * worldPosition;

  v_normal = (a_instancePosition * vec4(a_normal, 0)).xyz;

  v_texCoord = a_texcoord;

  gl_Position = v_position;
}
`

const surface_fs = `#version 300 es
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
  //vec3 texColor = texture(u_diffuse, v_texCoord*4.0).rgb;
  float noise = 1.0 - 0.8*fbm_layered(v_texCoord*30.0 + v_id);

  vec3 normal = normalize(v_normal);
  vec3 baseColor = mix(v_limbColor, v_color, normal.z*noise);

  outColor = vec4(baseColor, 1.0);
}
`

const surfaceProgramInfo = twgl.createProgramInfo(gl, [surface_vs, surface_fs]);

const diffraction_vs = `#version 300 es
in vec4 a_position;
out vec2 v_texcoord;

void main() {
  v_texcoord = a_position.xy;
  gl_Position = vec4(a_position.xy, 0.999, 1.0);
}
`

const diffraction_fs = `#version 300 es
precision highp float;

in vec2 v_texcoord;

struct Star {
  float radius;
  vec3 color;
  vec2 position;
};

uniform Star u_stars[${n_stars}];
uniform vec2 u_aspect;
uniform float u_time;

out vec4 outColor;

#define R32 0.8660254
#define  PI 3.1415927

const mat2 rot1 = mat2(0.5, -R32, R32, 0.5);
const mat2 rot2 = mat2(0.5, R32, -R32, 0.5);

float spike(vec2 d, float r) {
  vec2 s = abs(d) * vec2(8,1) + r;
  return dot(s,s) + sqrt(s.x) + s.y;
}

float spikes(vec2 p, float r) {
  float d = length(p);

  return log(2.0+r)*(0.01/(d+r) + 0.3/spike(p.yx, r) + 1.0/spike(p, r)
  + 1.0/spike(rot1*p, r) + 1.0/spike(rot2*p, r));
}

void main() {
  vec3 color = vec3(0);
  for(int i = 0; i < ${n_stars}; i++) {
    Star s = u_stars[i];
    vec2 d = (v_texcoord - s.position) * u_aspect;

    // diffraction spike
    float fac = 0.0;
    
    if(s.radius < 1.0) {
      fac += 0.008 * spikes(0.2*d, s.radius);
    }

    // heat glow
    if(s.radius > 0.1) {
      float noise = 0.0;
      float theta = atan(d.y, d.x);
      for(int n = 1; n < 256; n+=n)
	noise += sin(
	  theta*float(n+i%4)
	  +float(i)
	  +(float(n%5) - 2.0)*u_time
      )*inversesqrt(float(n));
      noise *= min(1.0, s.radius - 0.1);
      fac += 0.03*(1.0+0.5*noise)*pow(s.radius/(length(d) - 0.8*s.radius), 2.0);
    }

    
    color += fac * s.color*mix(s.color, vec3(1), fac);
  }  
  outColor = vec4(color, 1.0);
}
`

const diffractionProgramInfo = twgl.createProgramInfo(gl, [diffraction_vs, diffraction_fs]);

const diffractionScreenVAO = gl.createVertexArray()
gl.bindVertexArray(diffractionScreenVAO)
const diffractionScreenVertices = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, diffractionScreenVertices)
gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
const diffractionPositionLoc = gl.getAttribLocation(diffractionProgramInfo.program, "a_position")
gl.enableVertexAttribArray(diffractionPositionLoc)
gl.vertexAttribPointer(diffractionPositionLoc, 2, gl.FLOAT, false, 0, 0)


const bloom_vs = `#version 300 es
in vec4 a_position;
uniform vec2 u_resolution;
out vec2 v_texcoord;

void main() {
  v_texcoord = (a_position.xy * 0.5 + 0.5) * u_resolution;
  gl_Position = vec4(a_position.xy, -0.999, 1.0);
}
`
const bloom_fs = `#version 300 es
precision highp float;

in vec2 v_texcoord;
uniform vec2 u_resolution;
uniform sampler2D u_texture;

out vec4 outColor;
#define W 24.0
#define SQRT32 0.866025403784
#define SQUARE(u) u*u
vec3 tex(ivec2 p) {
  return SQUARE(texelFetch(u_texture, p, 0).rgb);
}
  
void main() {
  ivec2 pos = ivec2(v_texcoord);
  vec3 col = tex(pos) * 0.7;
  for(float i=-0.75*W; i<0.75*W; i+=4.0){
    if(i==0.0) continue;
    float f = exp(-0.5*i*i/W/W) / W; // normal distribution
    col += f * (
      tex(pos + ivec2( 0.0, i )) +
      tex(pos + ivec2( SQRT32*i, +0.5*i)) +
      tex(pos + ivec2( SQRT32*i, -0.5*i))
    );
  }
  outColor = vec4(sqrt(col), 1.0);
}
`

const bloomProgramInfo = twgl.createProgramInfo(gl, [bloom_vs, bloom_fs]);

const bloomScreenVAO = gl.createVertexArray()
gl.bindVertexArray(bloomScreenVAO)
const bloomScreenVertices = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, bloomScreenVertices)
gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
const bloomPositionLoc = gl.getAttribLocation(bloomProgramInfo.program, "a_position")
gl.enableVertexAttribArray(bloomPositionLoc)
gl.vertexAttribPointer(bloomPositionLoc, 2, gl.FLOAT, false, 0, 0)

const framebufferInfo = twgl.createFramebufferInfo(gl)
twgl.bindFramebufferInfo(gl, framebufferInfo)

twgl.setAttributePrefix("a_")

const starArrays = twgl.primitives.createSphereVertices(0.5, 128, 64)

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
}
const diffractionUniforms = {
  u_aspect: [0,0],
  u_time: 0
}
const bloomUniforms = {
  u_resolution: [0,0],
  u_texture: framebufferInfo.attachments[0]
}

const draw = async (now) => {
  stats.begin()

  if(then) time += (now-then)/1000
  then = now
  $time_slider.value = log10(1 + time).toFixed(2)
  $time_number.value = time.toFixed(2)
  await Promise.all(stars.map($ => star_update($, time)))

  gl.useProgram(surfaceProgramInfo.program);

  gl.enable(gl.CULL_FACE)
  gl.enable(gl.DEPTH_TEST)

  const zNear = 0;
  const zFar = 1000;
  const projection = m4.ortho(
    -aspect[0], aspect[0], 
    -aspect[1], aspect[1], 
    zNear, zFar
  )
  const eye = [0, 0, 1];
  const target = [0, 0, 0];
  const up = [0, 1, 0];

  const camera = m4.lookAt(eye, target, up);
  const view = m4.inverse(camera);
  uniforms.u_viewProjection = m4.multiply(projection, view);
  uniforms.u_time = time
  diffractionUniforms.u_time = time

  const instancePositions = new Float32Array(n_stars * 16)
  const instanceIDs = []
  const instanceRadii = []
  const instanceColors = []
  const instanceLimbColors = []
  diffractionUniforms.u_stars = []

  stars
  .sort((a, b) => (a.bubble.r  - b.bubble.r)) // depth sort by radius
  .forEach(($, i) => {
    const mat = new Float32Array(instancePositions.buffer, i * 16 * 4, 16)
    m4.identity(mat)
    m4.translate(mat, [$.bubble.x*aspect[0], $.bubble.y*aspect[1], -16 * $.bubble.r ],mat)
    m4.rotateZ(mat, i*100, mat)
    m4.rotateY(mat, time * (i%4 - 1.5), mat)

    instanceIDs.push(i)
    instanceRadii.push($.bubble.r)
    instanceColors.push(...$.bubble.color)
    instanceLimbColors.push(...$.bubble.limbColor)

    diffractionUniforms.u_stars.push({
      position: [...m4.transformPoint(m4.multiply(uniforms.u_viewProjection, mat), [0,0,0])].slice(0,2),
      radius: $.bubble.r,
      color: v3.multiply($.bubble.color, $.bubble.limbColor),
    })
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
    instanceRadius: {
      numComponents: 1,
      data: instanceRadii,
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
  const vertexArrayInfo = twgl.createVertexArrayInfo(gl, surfaceProgramInfo, bufferInfo)

  twgl.bindFramebufferInfo(gl, (quality>=2) ? framebufferInfo : null)
  gl.clear(gl.COLOR_BUFFER_BIT + gl.DEPTH_BUFFER_BIT)

  gl.useProgram(surfaceProgramInfo.program) 
  twgl.setBuffersAndAttributes(gl, surfaceProgramInfo, vertexArrayInfo);
  twgl.setUniforms(surfaceProgramInfo, uniforms);
  twgl.drawBufferInfo(gl, vertexArrayInfo, gl.TRIANGLES, vertexArrayInfo.numelements, 0, n_stars);

  if(quality>=1){
    gl.useProgram(diffractionProgramInfo.program)
    twgl.setUniforms(diffractionProgramInfo, diffractionUniforms);
    gl.bindVertexArray(diffractionScreenVAO)
    gl.drawArrays(gl.TRIANGLES,0,6)
  }

  if(quality>=2) {
    twgl.bindFramebufferInfo(gl, null)
    gl.clear(gl.COLOR_BUFFER_BIT + gl.DEPTH_BUFFER_BIT)

    gl.useProgram(bloomProgramInfo.program)
    twgl.setUniforms(bloomProgramInfo, bloomUniforms);
    gl.bindVertexArray(bloomScreenVAO)
    gl.drawArrays(gl.TRIANGLES,0,6)
  }

  info_update(info_star)

  stats.end()
  if(!pause) requestAnimationFrame(draw)
}
const start_draw = () => requestAnimationFrame(draw)

const SVG_NS = "http://www.w3.org/2000/svg"

const draw_text = (o) => {
  let text = document.createElementNS(SVG_NS, "text");

  o.props["dominant-baseline"] = "middle"
  o.props["text-anchor"] = "middle"

  for (const name in o.props) {
    if (o.props.hasOwnProperty(name)) {
      text.setAttributeNS(null, name, o.props[name]);
    }
  }

  text.textContent = o.text;
  $axes.appendChild(text);
  return text
}

const draw_labels = () => {
  const margin = 20
  $axes.innerHTML = ""
  draw_text({ props: { x: vw/2, y: 0  + margin }, text: "Effective Temperature (Kelvin)" })
  draw_text({ props: { x: vw/2, y: vh -5*margin }, text: "Blue vs Visible Light (B-V Index)" })
  draw_text({ props: { x: 0  + margin, y: vh/2, transform: "rotate(-90)" }, text: "Absolute magnitude" })
  draw_text({ props: { x: vw - margin, y: vh/2, transform: "rotate(+90)" }, text: "Luminosity in Suns (L⊙)" })

  draw_text({ props: { x: 0  + 3*margin, y: 0  + margin }, text: round(max_temp) })
  draw_text({ props: { x: vw - 3*margin, y: 0  + margin }, text: round(min_temp) })

  draw_text({ props: { x: 0  + 3*margin, y: vh -5*margin }, text: round(min_bv) })
  draw_text({ props: { x: vw - 3*margin, y: vh -5*margin }, text: round(max_bv) })

  draw_text({ props: { x: 0  + margin, y: 0  + 3*margin }, text: round(min_mag) })
  draw_text({ props: { x: 0  + margin, y: vh - 3*margin }, text: round(max_mag) })

  draw_text({ props: { x: vw - margin, y: 0  + 3*margin }, text: "10^"+round(log10(max_sol_lum)) })
  draw_text({ props: { x: vw - margin, y: vh - 3*margin }, text: "10^"+round(log10(min_sol_lum)) })
}

const resize = () => {
  const r = window.devicePixelRatio
  const w = window.innerWidth
  const h = window.innerHeight

  ww = (fullscreen || w<h) ? w : w/2
  wh = (fullscreen || h<w) ? h : h/2
  $aside.style.display = (fullscreen) ? "none" : "block"

  vw = ww * r
  vh = wh * r

  canvas.width = vw
  canvas.height = vh
  $aside.style.width = $main.style.width = ww+"px"
  $aside.style.height = $main.style.height = wh+"px"
  $axes.setAttribute("viewBox", "0 0 " + vw + " " + vh)

  diffractionUniforms.u_aspect = aspect = [sqrt(ww/wh), sqrt(wh/ww)]
  bloomUniforms.u_resolution = [vw, vh]
  
  gl.viewport(0,0,vw,vh)
  twgl.resizeFramebufferInfo(gl, framebufferInfo)
  draw_labels()
}
const info_update = ($) => {
  if(!$) return

  $info.innerHTML = [
    "Star " + $.id,
    "Phase: " + $.phase.name,
    "Temperature: " + round($.bubble.T) + " K", 
    "Mass: " + round($.bubble.M, 2) + " M"+sol, 
    "Luminosity: " + round($.bubble.L, 2) + " L"+sol, 
    "Radius: " + round($.bubble.R, 2) + " R"+sol, 
  ].join("<p>")

  const X = $.bubble.x > 0
  const Y = $.bubble.y > 0
  
  const x = clamp(0, ($.bubble.x + 1)/2, 1) * ww
  const y = clamp(0, ($.bubble.y + 1)/2, 1) * wh

  const x_far = X ? "left" : "right"
  const x_near = X ? "right" : "left"
  const y_far = Y ? "bottom" : "top"
  const y_near = Y ? "top" : "bottom"

  $info.style[x_far] = ""
  $info.style[x_near] = (X ? (ww - x) : x)+"px"

  $info.style[y_far] = ""
  $info.style[y_near] = (Y ? (wh - y) : y)+"px"

  $info.style["border-top-right-radius"] = ""
  $info.style["border-top-left-radius"] = ""
  $info.style["border-bottom-right-radius"] = ""
  $info.style["border-bottom-left-radius"] = ""
  $info.style["border-" + y_near + "-" + x_near + "-radius"] = 0
}


window.addEventListener("resize", resize)
$fullscreen.addEventListener("input", e => { fullscreen = e.target.checked; resize(); start_draw() })
$restart.addEventListener("click", e => { time = 0; stars_init(); start_draw() })
$time_pause.addEventListener("input", e => { pause = e.target.checked; then = 0; start_draw() })
$time_slider.addEventListener("input", e => { time = exp10(parseFloat(e.target.value)) - 1; start_draw() })
$time_number.addEventListener("input", e => { time = parseFloat(e.target.value); start_draw() })
$quality_select.addEventListener("input", e => { quality = e.target.value; start_draw() })
$board.addEventListener("click", e => {
  const x = 2*e.x/ww - 1
  const y = 1 - 2*e.y/wh

  info_star = stars
    .sort((a, b) => (a.bubble.r - b.bubble.r))
    .find($ => max($.bubble.r, 0.05) > norm([$.bubble.x, $.bubble.y], [x,y]))
  
  if(info_star) {
    $info.style.display = "block"
  } else {
    $info.style.display = "none"
  }
})

resize()
stars_init()
start_draw()

