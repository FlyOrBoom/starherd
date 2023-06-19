import * as twgl from './twgl-full.module.js';
import {
	scene_vs, scene_fs,
	diffraction_vs, diffraction_fs,
	bloom_vs, bloom_fs,
	composit_vs, composit_fs,
	clock_vs, clock_fs,
} from './shaders.js';
import {stars_init} from './crunch.js';

const m4 = twgl.m4;
const v3 = twgl.v3;

let ww; let wh; let vw; let vh; let aspect;

const $main = document.querySelector('#main');
const $aside = document.querySelector('#aside');

const $canvas = document.querySelector('#canvas');
const $axes = document.querySelector('#axes');
const $board = document.querySelector('#board');

const $info = document.querySelector('#info');
let info_star;

const gl = $canvas.getContext('webgl2');

const $fullscreen = document.querySelector('#fullscreen');
const $restart = document.querySelector('#restart');
const $slower = document.querySelector('#slower');
const $faster = document.querySelector('#faster');
const $time_pause = document.querySelector('#time-pause');
const $time_slider = document.querySelector('#time-slider');
const $time_number = document.querySelector('#time-number');
const $quality_select = document.querySelector('#quality-select');
const $debug = document.querySelector('#debug');

let speed = 1; // millions of years per second
let pause = false;
let fullscreen = false;
let time = 0;
let then = 0;
let quality = 2;

const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom

let debug = false;
$debug.onclick = () => { 
	debug = true; 
	$main.appendChild(stats.dom); 
	$debug.parentNode.removeChild($debug) 
}

// Init

const createQuadVAO = pass => {
	pass.screenVAO = gl.createVertexArray();
	gl.bindVertexArray(pass.screenVAO);

	pass.screenVertices = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, pass.screenVertices);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

	pass.positionLoc = gl.getAttribLocation(pass.programInfo.program, 'a_position');
	gl.enableVertexAttribArray(pass.positionLoc);
	gl.vertexAttribPointer(pass.positionLoc, 2, gl.FLOAT, false, 0, 0);
};

twgl.setAttributePrefix('a_');

// Scene: rasterize geometry with star textures
const scene = {
	programInfo: twgl.createProgramInfo(gl, [scene_vs, scene_fs]),
	framebufferInfo: twgl.createFramebufferInfo(gl),
	uniforms: {},
};
const starArrays = twgl.primitives.createSphereVertices(0.5, 128, 64); // Instanced spheres VAO

// Clock: clock.
const clock = {
	programInfo: twgl.createProgramInfo(gl, [clock_vs, clock_fs]),
	framebufferInfo: twgl.createFramebufferInfo(gl),
	uniforms: {},
};
createQuadVAO(clock);

// Diffraction: analytic large diffraction spikes; quarter res
const diffraction = {
	programInfo: twgl.createProgramInfo(gl, [diffraction_vs, diffraction_fs]),
	framebufferInfo: twgl.createFramebufferInfo(gl),
	uniforms: {},
};
createQuadVAO(diffraction);

// Bloom: convolved small diffraction spikes; quarter res
const bloom = {
	programInfo: twgl.createProgramInfo(gl, [bloom_vs, bloom_fs]),
	framebufferInfo: twgl.createFramebufferInfo(gl),
	uniforms: {
		u_scene: scene.framebufferInfo.attachments[0],
	},
};
createQuadVAO(bloom);

// Composit: merge all together
const composit = {
	programInfo: twgl.createProgramInfo(gl, [composit_vs, composit_fs]),
	uniforms: {
		u_scene: scene.framebufferInfo.attachments[0],
		u_diffraction: diffraction.framebufferInfo.attachments[0],
		u_bloom: bloom.framebufferInfo.attachments[0],
	},
};
createQuadVAO(composit);

const draw = async now => {
	stats.begin();
	
	const deltaTime = speed * (now - then) * 1000;
	if (then && !pause) {
		time += deltaTime * 1e-6;
	}
	const fractTime = 1e3 * fract(1e3*time);

	then = now;

	$time_slider.value = log10(1 + time).toFixed(2);
	$time_number.value = time.toFixed(2);

	await Promise.all(stars.map($ => $.update(time)));

	{
		const zNear = 0;
		const zFar = 1000;
		const projection = m4.ortho(
			-aspect[0], aspect[0],
			-aspect[1], aspect[1],
			zNear, zFar,
		);
		const eye = [0, 0, 1];
		const target = [0, 0, 0];
		const up = [0, 1, 0];

		const camera = m4.lookAt(eye, target, up);
		const view = m4.inverse(camera);

		scene.uniforms.u_viewProjection = m4.multiply(projection, view);
		scene.uniforms.u_time = time;
		scene.uniforms.u_fractTime = fractTime;

		clock.uniforms.u_time = time;
		clock.uniforms.u_fractTime = fractTime
		clock.uniforms.u_deltaTime = deltaTime;

		diffraction.uniforms.u_time = time;
		diffraction.uniforms.u_fractTime = fractTime;
		diffraction.uniforms.u_stars = [];

		const instancePositions = new Float32Array(n_stars * 16);
		const instanceIDs = [];
		const instanceRadii = [];
		const instanceColors = []; const instanceLimbColors = [];
		for (const [i, $] of stars
			.sort((a, b) => (a.bubble.r - b.bubble.r)).entries()) {
			const mat = new Float32Array(instancePositions.buffer, i * 16 * 4, 16);
			m4.identity(mat);
			m4.translate(mat, [$.bubble.x * aspect[0], $.bubble.y * aspect[1], -16 * $.bubble.r], mat);
			m4.rotateZ(mat, i * 100, mat);
			m4.rotateY(mat, time * 10 * ($.id % 6 - 2.5), mat);

			instanceIDs.push(i);
			instanceRadii.push($.bubble.r);
			instanceColors.push(...$.bubble.color);
			instanceLimbColors.push(...$.bubble.limbColor);

			diffraction.uniforms.u_stars.push({
				position: [...m4.transformPoint(m4.multiply(scene.uniforms.u_viewProjection, mat), [0, 0, 0])].slice(0, 2),
				radius: $.bubble.r,
				color: v3.multiply($.bubble.color, $.bubble.limbColor),
			});
		}

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
		});
	}

	if (quality >= 0) {
		// offscreen if there's additional processing (quality>=1)
		twgl.bindFramebufferInfo(gl, (quality >= 1) ? scene.framebufferInfo : null);
		gl.clear(gl.COLOR_BUFFER_BIT + gl.DEPTH_BUFFER_BIT);
		gl.enable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);

		// Draw clock
		gl.useProgram(clock.programInfo.program);
		twgl.setUniforms(clock.programInfo, clock.uniforms);
		gl.bindVertexArray(clock.screenVAO);

		gl.drawArrays(gl.TRIANGLES, 0, 6);
	
		// Draw scene
		gl.useProgram(scene.programInfo.program);

		const bufferInfo = twgl.createBufferInfoFromArrays(gl, starArrays);
		const vertexArrayInfo = twgl.createVertexArrayInfo(gl, scene.programInfo, bufferInfo);

		gl.useProgram(scene.programInfo.program);
		twgl.setBuffersAndAttributes(gl, scene.programInfo, vertexArrayInfo);
		twgl.setUniforms(scene.programInfo, scene.uniforms);

		twgl.drawBufferInfo(gl, vertexArrayInfo, gl.TRIANGLES, vertexArrayInfo.numelements, 0, n_stars);
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.DEPTH_TEST);
	}

	if (quality >= 1) {
		gl.useProgram(diffraction.programInfo.program);
		twgl.setUniforms(diffraction.programInfo, diffraction.uniforms);
		gl.bindVertexArray(diffraction.screenVAO);
		twgl.bindFramebufferInfo(gl, diffraction.framebufferInfo);

		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	if (quality >= 2) {
		gl.useProgram(bloom.programInfo.program);
		twgl.setUniforms(bloom.programInfo, bloom.uniforms);
		gl.bindVertexArray(bloom.screenVAO);
		twgl.bindFramebufferInfo(gl, bloom.framebufferInfo);

		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	if (quality >= 1) {
		gl.useProgram(composit.programInfo.program);
		twgl.setUniforms(composit.programInfo, composit.uniforms);
		gl.bindVertexArray(composit.screenVAO);

		twgl.bindFramebufferInfo(gl, null);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	info_update(info_star);

	stats.end();
	if (!pause) {
		requestAnimationFrame(draw);
	}
};

const start_draw = () => requestAnimationFrame(draw);
const draw_once = () => pause && start_draw();

const SVG_NS = 'http://www.w3.org/2000/svg';

const draw_text = o => {
	const text = document.createElementNS(SVG_NS, 'text');

	o.props['dominant-baseline'] = 'middle';
	o.props['text-anchor'] = 'middle';

	for (const name in o.props) {
		if (o.props.hasOwnProperty(name)) {
			text.setAttributeNS(null, name, o.props[name]);
		}
	}

	text.textContent = o.text;
	$axes.append(text);
	return text;
};

const draw_labels = () => {
	const margin = 20;
	$axes.innerHTML = '';
	draw_text({props: {x: vw / 2, y: 0 + margin}, text: 'Effective Temperature (Kelvin)'});
	draw_text({props: {x: vw / 2, y: vh - 5 * margin}, text: 'Blue vs Visible Light (B-V Index)'});
	draw_text({props: {x: 0 + margin, y: vh / 2, transform: 'rotate(-90)'}, text: 'Absolute magnitude'});
	draw_text({props: {x: vw - margin, y: vh / 2, transform: 'rotate(+90)'}, text: 'Luminosity in Suns (L⊙)'});

	draw_text({props: {x: 0 + 3 * margin, y: 0 + margin}, text: round(max_temp)});
	draw_text({props: {x: vw - 3 * margin, y: 0 + margin}, text: round(min_temp)});

	draw_text({props: {x: 0 + 3 * margin, y: vh - 5 * margin}, text: round(min_bv)});
	draw_text({props: {x: vw - 3 * margin, y: vh - 5 * margin}, text: round(max_bv)});

	draw_text({props: {x: 0 + margin, y: 0 + 3 * margin}, text: round(max_mag)});
	draw_text({props: {x: 0 + margin, y: vh - 3 * margin}, text: round(min_mag)});

	draw_text({props: {x: vw - margin, y: 0 + 3 * margin}, text: '10^' + round(log10(max_sol_lum))});
	draw_text({props: {x: vw - margin, y: vh - 3 * margin}, text: '10^' + round(log10(min_sol_lum))});
};

const resize = () => {
	const r = window.devicePixelRatio;
	const w = window.innerWidth;
	const h = window.innerHeight;

	ww = (fullscreen || w < h) ? w : w / 2;
	wh = (fullscreen || h < w) ? h : h / 2;
	$aside.style.display = (fullscreen) ? 'none' : 'block';

	vw = ww * r;
	vh = wh * r;

	canvas.width = vw;
	canvas.height = vh;
	$aside.style.width = $main.style.width = ww + 'px';
	$aside.style.height = $main.style.height = wh + 'px';
	$axes.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);

	bloom.uniforms.u_resolution = [vw, vh];

	aspect = [sqrt(ww / wh), sqrt(wh / ww)];
	diffraction.uniforms.u_aspect = aspect;
	clock.uniforms.u_aspect = aspect;

	gl.viewport(0, 0, vw, vh);
	twgl.resizeFramebufferInfo(gl, scene.framebufferInfo);
	twgl.resizeFramebufferInfo(gl, diffraction.framebufferInfo, null, vw / 4, vh / 4);
	twgl.resizeFramebufferInfo(gl, bloom.framebufferInfo, null, vw / 4, vh / 4);

	draw_once();
	draw_labels();
};

const info_update = $ => {
	if (!$) {
		return;
	}

	$info.innerHTML = [
		'Star ' + $.id,
		'Phase: ' + $.phase.name,
		'Temperature: ' + round($.bubble.T) + ' K',
		'Mass: ' + round($.bubble.M, 2) + ' M' + sol,
		'Luminosity: ' + round($.bubble.L, 2) + ' L' + sol,
		'Radius: ' + round($.bubble.R, 2) + ' R' + sol,
	].join('<p>');

	const X = $.bubble.x > 0;
	const Y = $.bubble.y > 0;

	const x = clamp(0, ($.bubble.x + 1) / 2, 1) * ww;
	const y = clamp(0, ($.bubble.y + 1) / 2, 1) * wh;

	const x_far = X ? 'left' : 'right';
	const x_near = X ? 'right' : 'left';
	const y_far = Y ? 'bottom' : 'top';
	const y_near = Y ? 'top' : 'bottom';

	$info.style[x_far] = '';
	$info.style[x_near] = (X ? (ww - x) : x) + 'px';

	$info.style[y_far] = '';
	$info.style[y_near] = (Y ? (wh - y) : y) + 'px';

	$info.style['border-top-right-radius'] = '';
	$info.style['border-top-left-radius'] = '';
	$info.style['border-bottom-right-radius'] = '';
	$info.style['border-bottom-left-radius'] = '';
	$info.style['border-' + y_near + '-' + x_near + '-radius'] = 0;
};

window.addEventListener('resize', resize);
$fullscreen.addEventListener('input', e => {
	fullscreen = e.target.checked; resize();
});

$slower.addEventListener('click', e => {
	speed = max(1e-6, speed/10)
});
$faster.addEventListener('click', e => {
	speed = min(1e+3, speed*10);
});

$restart.addEventListener('click', e => {
	time = 0; stars_init(); draw_once();
});

$time_pause.addEventListener('input', e => {
	pause = e.target.checked; start_draw();
});

$time_slider.addEventListener('input', e => {
	time = exp10(Number.parseFloat(e.target.value)) - 1; draw_once();
});
$time_number.addEventListener('input', e => {
	time = Number.parseFloat(e.target.value); draw_once();
});

$quality_select.addEventListener('input', e => {
	quality = e.target.value; 

	twgl.bindFramebufferInfo(gl, bloom.framebufferInfo);
	gl.clear(gl.COLOR_BUFFER_BIT + gl.DEPTH_BUFFER_BIT);

	draw_once();
});

$board.addEventListener('click', e => {
	const x = 2 * e.x / ww - 1;
	const y = 1 - 2 * e.y / wh;

	info_star = stars
		.sort((a, b) => (a.bubble.r - b.bubble.r))
		.find($ => max($.bubble.r, 0.05) > norm([$.bubble.x, $.bubble.y], [x, y]));

	$info.style.display = info_star ? 'block' : 'none';
});

resize();
stars_init();
start_draw();
