const std = `#version 300 es
precision mediump int;
precision highp float;

#define R32 0.8660254
#define  PI 3.1415927
#define TAU 6.2831853
`

const include_hash33 = `
//--BEGIN Hash without Sine by Dave Hoskins: https://www.shadertoy.com/view/4djSRW

vec3 hash33(vec3 p3)
{
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz+33.33);
  return fract((p3.xxy + p3.yxx)*p3.zyx);
}

//--END
`

export const scene_vs = std + `
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
in float a_instanceDay;

out float v_id;
out vec4 v_position;
out vec3 v_normal;
out vec3 v_color;
out vec3 v_limbColor;
out float v_radius;
out vec2 v_texcoord0;
out vec2 v_texcoord1;
out float v_day;

${include_hash33}

//--BEGIN Voronoise by Inigo Quilez: https://www.shadertoy.com/view/Xd23Dh

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

//--END

void main() {
  v_id = a_instanceID;
  v_color = a_instanceColor;
  v_limbColor = a_instanceLimbColor * a_instanceColor * a_instanceColor;

  float radius = a_instanceRadius * (1.0 + 0.1*voronoise(8.0*a_normal + 100.0*v_id));
  vec4 worldPosition = a_instancePosition * vec4(a_normal*radius, 1.0);
  v_position = u_viewProjection * worldPosition;
  v_position.z = a_instanceRadius/100.0;

  v_normal = normalize(a_normal);

  v_radius = a_instanceRadius;
  v_day = a_instanceDay;
  v_texcoord0 = a_texcoord - vec2(a_instanceDay, 0);
  v_texcoord1 = a_texcoord - vec2(2.0*a_instanceDay, 0);

  gl_Position = v_position;
}
`

export const scene_fs = std + `
in float v_id;
in float v_radius;
in vec4 v_position;
in vec3 v_color;
in vec3 v_limbColor;
in vec3 v_normal;
in float v_day;
in vec2 v_texcoord0;
in vec2 v_texcoord1;

uniform float u_time;
uniform float u_fractTime;

out vec4 outColor;

//--BEGIN Warped noise by Inigo Quilez: https://www.shadertoy.com/view/lsl3RH

const mat2 fbm_mat = mat2( 0.80,  0.60, -0.60,  0.80 );

float noise( in vec2 p )
{
  return sin(p.x)*sin(p.y);
}

float fbm4( vec2 p )
{
  float f = 0.0;
  f += 0.5000*noise( p + u_time/25.0 ); p = fbm_mat*p*2.02;
  f += 0.2500*noise( p - u_time/5.0 ); p = fbm_mat*p*2.03;
  if(v_radius > 0.05) {
    f += 0.1250*noise( p + u_time ); p = fbm_mat*p*2.01;
    f += 0.0625*noise( p - u_time*5. );
  }
  return f/0.9375;
}

vec2 fbm4_2( vec2 p )
{
  return vec2(fbm4(p), fbm4(p+vec2(7.8)));
}

float func( vec2 q, out vec4 ron )
{
  q += 0.03*sin(length(q)*vec2(4.1,4.3));

  vec2 o = fbm4_2( 0.9*q );

  o += 0.04*sin(length(o));

  vec2 n = fbm4_2( 3.0*o );

  ron = vec4( o, n );

  float f = 0.5 + 0.5*fbm4( 1.8*q + 6.0*n );

  return mix( f, f*f*f*3.5, f*abs(n.x) );
}

float fbm_layered(vec2 p) {
  float e = 2.0;

  vec4 on = vec4(0.0);
  float f = func(p, on);

  return smoothstep(0.05, 0.0, f * dot(on.zw,on.zw) * (on.y*on.y));
}

//--END

//--BEGIN Fake voronoi cell pattern by Shane: https://www.shadertoy.com/view/MdKXDD

const mat2 vor_mat = mat2(.7, -.5, .5, .7);

#define vorf dot(fract(1e-3*u_fractTime + (p*vor_mat))-.5, fract(1e-3*u_fractTime + (p*=vor_mat))-0.5)

float voronoi(vec2 p) {
    return min(min(vorf, vorf), vorf);
}

//--END

mat2 rotate2d(float a){
  return mat2(cos(a),-sin(a),
	      sin(a),cos(a));
}

void main() {
  vec3 rotNormal = v_normal;
  rotNormal.xz = rotate2d(-v_day*TAU) * v_normal.xz; // differential rotation!

  float stripe = 0.5 + 0.5 * cos(v_normal.y*PI);
  // texture
  float noise0 = mix( // light
    fbm_layered(v_texcoord0*vec2(11,13) + v_id),
    fbm_layered(v_texcoord1*vec2(13,17) + v_id),
    stripe
  );
  float noise1 = mix( // dark
    fbm_layered(v_texcoord0*vec2(23,29) + v_id),
    fbm_layered(v_texcoord1*vec2(29,31) + v_id),
    stripe
  );

  vec3 col = mix(v_limbColor, v_color*mix(1.2, 1.0, noise1), v_normal.z*noise0);

  //starspots
  if(v_radius > 0.01) {
    float starspot_region = 1.0-v_normal.y*v_normal.y; // near equator
    col *= mix(1.0, 0.3, smoothstep(0.05*starspot_region, 0.0, min(noise0, noise1)));
  }

  // convection cells
  if(v_radius > 0.05) {
    float noise2 = voronoi(v_texcoord0*(1e3 + 2e2*(noise0-noise1)));
    col *= mix(vec3(1), v_limbColor, noise2);
  }

  outColor = vec4(col, 1.0);
}
`

export const diffraction_vs = std + `
in vec4 a_position;
out vec2 v_texcoord;

void main() {
  v_texcoord = a_position.xy;
  gl_Position = vec4(a_position.xy, 0.0, 1.0);
}
`

export const diffraction_fs = std + `
in vec2 v_texcoord;

struct Star {
  float radius;
  vec3 color;
  vec2 position;
};

uniform Star u_stars[${n_stars}];
uniform vec2 u_aspect;
uniform float u_time;
uniform float u_zoom;
uniform float u_fractTime;

out vec4 outColor;

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
  for(int i = ${n_stars-1}; i >= 0; i--) { // bigger stars first
    Star s = u_stars[i];
    vec2 d = (v_texcoord - s.position) * u_aspect;

    float r = s.radius / u_zoom;

    if(r*r> dot(d,d)*1.3 + 0.0002) discard; // occluded by star

    // diffraction spike
    float fac = 0.0;
    
    if(r < 1.0) {
      fac += 0.008 * spikes(0.2*d, r);
    }

    // corona
    float t = u_time;
    if(r > 0.1) {
      float noise = 0.0;
      float theta = atan(d.y, d.x);
      for(int n = 1; n < 256; n+=n)
	noise += sin(
	  theta*float(n+i%4)
	  +float(i)
	  +(float(n%5) - 2.0)*t*TAU
	)*inversesqrt(float(n));
      noise *= min(1.0, r - 0.1);
      t *= 10.;
      fac += 0.03*(1.0+0.5*noise)*pow(r/(length(d) - 0.8*r), 2.0);
    }

    
    color += fac * s.color*mix(s.color, vec3(1), fac);
  }  
  outColor = vec4(color, 1.0);
}
`

export const bloom_vs = std + `
in vec4 a_position;
uniform vec2 u_resolution;
out vec2 v_texcoord;

void main() {
  v_texcoord = (a_position.xy * 0.5 + 0.5) * u_resolution;
  gl_Position = vec4(a_position.xy, 0.0, 1.0);
}
`
export const bloom_fs = std + `
in vec2 v_texcoord;
uniform sampler2D u_scene;

out vec4 outColor;
#define W 16.0
#define SQRT32 0.866025403784
#define SQUARE(u) (u*u*u)
vec3 tex(ivec2 p) {
  return SQUARE(texelFetch(u_scene, ivec2(v_texcoord) + p, 0).rgb);
}
  
void main() {
  vec3 col = vec3(0);
  for(float i=-W; i<W; i++){
    if(i == 0.0) continue;
    float f = exp(-i*i/W/W) / W; // normal distribution
    col += f * (
      tex(ivec2( 0.0, i )) +
      tex(ivec2( SQRT32*i, +0.5*i)) +
      tex(ivec2( SQRT32*i, -0.5*i))
    );
  }
  outColor = vec4(col, 1.0);
}
`

export const composit_vs = std + `
in vec4 a_position;
out vec2 v_texcoord;

void main() {
  v_texcoord = (0.5 + 0.5*a_position.xy);
  gl_Position = vec4(a_position.xy, 0.0, 1.0);
}
`

export const composit_fs = std + `
in vec2 v_texcoord;

uniform sampler2D u_diffraction;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;

out vec4 outColor;

void main() {
  vec4 diffractionCol = texture(u_diffraction, v_texcoord);
  vec4 sceneCol = texture(u_scene, v_texcoord);

  vec3 bloomCol = texture(u_bloom, v_texcoord).rgb;
  vec3 mainCol = mix(diffractionCol.rgb, sceneCol.rgb, sceneCol.a); 

  vec3 col = sqrt(0.8*mainCol*mainCol + 0.6*bloomCol*bloomCol);
  outColor = vec4(col, 1.0);
}
`

export const clock_vs = std + `
in vec4 a_position;
out vec2 v_texcoord;

uniform vec2 u_aspect;

void main() {
  v_texcoord = a_position.xy;
  gl_Position = vec4(0.15*u_aspect.yx*(a_position.xy + vec2(1.1,1.5)) - 1.0, -0.999, 1.0);
}
`

export const clock_fs = std + `
in vec2 v_texcoord;

uniform float u_time;
uniform float u_fractTime;
uniform float u_deltaTime;

#define SPIKE(u) (abs(mod((u) + 0.5, 1.0) - 0.5))

const int HANDS = 12;
const float RATIO = 10.0;

out vec4 outColor;

void main() {
    float theta = atan(v_texcoord.x, -v_texcoord.y)/TAU;
    float r = length(v_texcoord);

    if(r > 1.0) discard;

    float t = u_fractTime;
    float dt = u_deltaTime;

    vec3 col = vec3(0.7, 0.8, 0.9);
    col *= smoothstep(0.10, 0.0, abs(r-1.0))*(
        smoothstep(0.10, 0.0, SPIKE(theta*10.0)) +
        smoothstep(0.10, 0.0, SPIKE(theta*100.0))
    ) + 0.5*smoothstep(0.95, 0.97, r);

    for(int i = 0; i < HANDS; i++) {
        dt /= RATIO;
        t /= RATIO;
	if(i == 2) t = u_time * 1e3;

        float sharp = 0.02 * pow(2.0, -log2(0.01+dt));
        float j = float(i)/float(HANDS);
        float k = 1.0 - j;

        float phi = mod(theta + t - j*0.1, 1.0) - 0.5;
        bool leading = phi < 0.0;

        phi = abs(phi);
        //phi *= smoothstep(0.5, 0.0, phi);
        phi *= leading ? 8.0 : 1.0;
        float width = j * 3e-2 + 1e-3;

        float x = max(abs(phi)*r - width*(1.0-r/k), 0.0);
        x *= sharp*100./(leading ? 1.0 : r);

	if(r < k) {
	  float f = exp(-x*x/2.0)*sharp*(1.0-pow(r/k,4.0));
	  f += 0.1 * (0.2 + r/k);
	  f *= 12.0/float(HANDS);
	  f = clamp(0.0, 1.0, f);
	  col += f*normalize(vec3(j, 0.3, 1.0-j));
	}
    }
    if(length(col) > 1.0) col = mix(normalize(col), col, 0.5);

    outColor = vec4(col, 1.0);
}`
