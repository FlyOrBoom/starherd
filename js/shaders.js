const std = `#version 300 es
precision lowp float;`

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

  float radius = a_instanceRadius * (1.0 + 0.1*voronoise(8.0*a_normal + 100.0*v_id));
  vec4 surfacePosition = vec4(a_normal * radius, 1.0);
  vec4 worldPosition = a_instancePosition * surfacePosition;
  v_position = u_viewProjection * worldPosition;

  v_normal = (a_instancePosition * vec4(a_normal, 0)).xyz;

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

  return smoothstep(0.2, 0.0, f * dot(on.zw,on.zw) * (on.y*on.y));
}

/*
float hash1( float n ) { return fract(sin(n)*43758.5453); }
vec2  hash2( vec2  p ) { p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) ); return fract(sin(p)*43758.5453); }

// The parameter w controls the smoothness
float voronoi( in vec2 x, float w )
{
  vec2 n = floor( x );
  vec2 f = fract( x );

  float m = 1.0;
  for( int j=-2; j<=2; j++ )
  for( int i=-2; i<=2; i++ )
  {
    vec2 g = vec2( float(i),float(j) );
    vec2 o = hash2( n + g );

    // animate
    o = 0.5 + 0.5*sin(u_time + 6.2831*o );

    // distance to cell
    float d = length(g - f + o);

    // do the smooth min for colors and distances
    float h = smoothstep( -1.0, 1.0, (m-d)/w );
    m = mix(m, d, h) - h*(1.0-h)*w/(1.0+3.0*w); // distance
  }
  return m;
}
*/

void main() {
  //vec3 texColor = texture(u_diffuse, v_texcoord*vec2(8,1)).rgb;
  vec2 uv = v_normal.xy + v_normal.yz;
  float noise1 = fbm_layered(uv*3.0 + v_id);
  float noise2 = fbm_layered(uv*vec2(7,19) + v_id);
  //float noise3 = voronoi(v_texcoord*10.0, 3.0);

  vec3 normal = normalize(v_normal);
  vec3 baseColor = mix(v_limbColor, v_color*mix(1.2, 1.0, noise2),normal.z*noise1);

  outColor = vec4(baseColor, 1.0);
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
