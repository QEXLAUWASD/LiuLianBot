// Keep the framebuffer between incremental RDP updates and browser composites.
const renderers = new WeakMap();

function createGpuRenderer(canvas, gl) {
  let resources;
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    resources = null;
  });
  canvas.addEventListener('webglcontextrestored', () => { resources = null; });
  function initialize() {
    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, `attribute vec2 position;
        varying vec2 uv;
        void main() { uv = vec2(position.x, 1.0 - position.y);
          gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0); }`],
      [gl.FRAGMENT_SHADER, `precision mediump float;
        varying vec2 uv;
        uniform sampler2D pixels;
        void main() { gl_FragColor = vec4(texture2D(pixels, uv).rgb, 1.0); }`],
    ]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        gl.deleteProgram(program);
        throw new Error('RDP GPU shader compilation failed');
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      throw new Error('RDP GPU shader linking failed');
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, 'pixels'), 0);
    resources = { program, buffer, texture };
  }
  return {
    clear() {
      if (gl.isContextLost()) return;
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    draw(output) {
      if (gl.isContextLost()) throw new Error('RDP GPU context lost');
      if (!resources) initialize();
      const { width, height, x, y, clipWidth, clipHeight, data } = output;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      gl.viewport(x, canvas.height - y - height, width, height);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x, canvas.height - y - clipHeight, clipWidth, clipHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}

function rendererFor(canvas) {
  if (renderers.has(canvas)) return renderers.get(canvas);
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: true, powerPreference: 'high-performance',
  });
  let renderer;
  if (gl) renderer = createGpuRenderer(canvas, gl);
  else {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('RDP canvas rendering is unavailable');
    renderer = {
      clear: () => ctx.clearRect(0, 0, canvas.width, canvas.height),
      draw(output) {
        const image = ctx.createImageData(output.width, output.height);
        image.data.set(output.data);
        ctx.putImageData(image, output.x, output.y, 0, 0, output.clipWidth, output.clipHeight);
      },
    };
  }
  canvas.dataset.renderer = gl ? 'webgl' : '2d';
  renderers.set(canvas, renderer);
  return renderer;
}

export function renderBitmap(canvas, output) { rendererFor(canvas).draw(output); }
export function clearRdpCanvas(canvas) { if (canvas) rendererFor(canvas).clear(); }
