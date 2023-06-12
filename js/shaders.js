const std = `#version 300 es
precision mediump int;
precision highp float;

#define R32 0.8660254
#define  PI 3.1415927

vec3 hash33(vec3 p3)
{
  p3 = fract(p3 * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yxz+33.33);
  return fract((p3.xxy + p3.yxx)*p3.zyx);
}
`

export const surface_vs = std + `
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
out vec2 v_texcoord;
out vec3 v_normal;
out vec3 v_worldNormal;
out vec3 v_color;
out vec3 v_limbColor;

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

  float radius = a_instanceRadius * (1.0 + 0.1*voronoise(8.0*a_normal + 100.0*v_id));
  vec4 worldPosition = a_instancePosition * vec4(a_normal*radius, 1.0);
  v_position = u_viewProjection * worldPosition;

  v_normal = normalize(a_normal);
  v_worldNormal = normalize((a_instancePosition * vec4(a_normal, 0)).xyz);

  v_texcoord = a_texcoord;

  gl_Position = v_position;
}
`

export const surface_fs = std + `
in float v_id;
in vec4 v_position;
in vec3 v_color;
in vec3 v_limbColor;
in vec2 v_texcoord;
in vec3 v_normal;
in vec3 v_worldNormal;

uniform float u_time;

out vec4 outColor;

const mat2 fbm_mat = mat2( 0.80,  0.60, -0.60,  0.80 );

float noise( in vec2 p )
{
	return sin(p.x)*sin(p.y);
}

float fbm4( vec2 p )
{
    float f = 0.0;
    f += 0.5000*noise( p + u_time ); p = fbm_mat*p*2.02;
    f += 0.2500*noise( p - u_time ); p = fbm_mat*p*2.03;
    f += 0.1250*noise( p + u_time ); p = fbm_mat*p*2.01;
    f += 0.0625*noise( p - u_time );
    return f/0.9375;
}

vec2 fbm4_2( vec2 p )
{
    return vec2(fbm4(p), fbm4(p+vec2(7.8)));
}

//====================================================================

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

float fbm_biplanar(vec3 n, vec3 p) {
  return dot(abs(n.xz), vec2(fbm_layered(p.zy), fbm_layered(p.xy)));
}

// https://www.shadertoy.com/view/MdKXDD

const mat2 vor_mat = mat2(.7, -.5, .5, .7);
#define vorf dot(fract(p*vor_mat)-.5, fract(p*=vor_mat)-0.5)

float voronoi(vec2 p) {
    return min(min(vorf, vorf), vorf);
}

float voronoi_biplanar(vec3 n, vec3 p) {
  return dot(abs(n.xz), vec2(voronoi(p.zy), voronoi(p.xy)));
}

void main() {
  // texture
  float noise1 = fbm_biplanar(v_normal, v_normal*vec3(3,5,3) + v_id); // dark
  float noise2 = fbm_biplanar(v_normal, v_normal*vec3(5,23,7) + v_id); // light

  vec3 col = mix(v_limbColor, v_color*mix(1.2, 1.0, noise2), v_worldNormal.z*noise1);

  //starspots
  float starspot_region = 1.0-v_normal.y*v_normal.y; // near equator
  col *= mix(1.0, 0.3, smoothstep(0.05*starspot_region, 0.0, noise1*noise2));

  // convection cells
  float noise3 = voronoi_biplanar(v_normal, v_normal*(1e2 + 0.1*(noise1 - noise2)));
  col *= mix(vec3(1), v_limbColor, noise3);

  outColor = vec4(col, 1.0);
}
`

export const diffraction_vs = std + `
in vec4 a_position;
out vec2 v_texcoord;

void main() {
  v_texcoord = a_position.xy;
  gl_Position = vec4(a_position.xy, 0.999, 1.0);
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
export const bloom_vs = std + `
in vec4 a_position;
uniform vec2 u_resolution;
out vec2 v_texcoord;

void main() {
  v_texcoord = (a_position.xy * 0.5 + 0.5) * u_resolution;
  gl_Position = vec4(a_position.xy, -0.999, 1.0);
}
`
export const bloom_fs = std + `
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
