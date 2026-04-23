;(function(){
  if (!window.THREE || !window.POSTPROCESSING) {
    var root = document.getElementById('webgl-bg')
    if (!root) {
      root = document.createElement('div')
      root.id = 'webgl-bg'
      root.style.position = 'fixed'
      root.style.inset = '0'
      root.style.zIndex = '-1'
      root.style.pointerEvents = 'none'
      document.body.appendChild(root)
    }
    var c = document.createElement('canvas')
    c.style.width = '100%'
    c.style.height = '100%'
    c.width = root.clientWidth
    c.height = root.clientHeight
    root.appendChild(c)
    var ctx = c.getContext('2d')
    var w = c.width, h = c.height
    var particles = []
    var N = 600
    for (var i=0;i<N;i++){
      particles.push({ x: Math.random()*w, y: Math.random()*h, a: Math.random()*Math.PI*2, s: 0.6+Math.random()*1.4 })
    }
    function noise(x,y,t){
      return Math.sin(x*0.002 + t*0.5) * Math.cos(y*0.002 - t*0.4)
    }
    var t0 = performance.now()*0.001
    function loop(){
      var t = performance.now()*0.001 - t0
      ctx.clearRect(0,0,w,h)
      ctx.fillStyle = 'rgba(20, 10, 40, 0.3)'  // dark purple background tint
      ctx.fillRect(0,0,w,h)
      for (var i=0;i<N;i++){
        var p = particles[i]
        var n = noise(p.x, p.y, t)
        p.a += n*0.02
        p.x += Math.cos(p.a)*p.s
        p.y += Math.sin(p.a)*p.s
        if (p.x < 0) p.x += w; if (p.x > w) p.x -= w
        if (p.y < 0) p.y += h; if (p.y > h) p.y -= h
        var intensity = 0.5 + Math.abs(n) * 0.5
        var r = Math.floor(139 * intensity)
        var g = Math.floor(92 * intensity)
        var b = Math.floor(246 * intensity)
        ctx.fillStyle = 'rgba('+r+','+g+','+b+',0.6)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2)
        ctx.fill()
      }
      requestAnimationFrame(loop)
    }
    loop()
    return
  }
  var root = document.getElementById('webgl-bg')
  if (!root) {
    root = document.createElement('div')
    root.id = 'webgl-bg'
    root.style.position = 'fixed'
    root.style.inset = '0'
    root.style.zIndex = '0'
    root.style.pointerEvents = 'none'
    document.body.appendChild(root)
  }
  var scene = new THREE.Scene()
  var camera = new THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.1, 1000)
  camera.position.set(0, 10, 18)
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(root.clientWidth, root.clientHeight)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  root.appendChild(renderer.domElement)
  var composer = new POSTPROCESSING.EffectComposer(renderer)
  var renderPass = new POSTPROCESSING.RenderPass(scene, camera)
  var fxaa = new POSTPROCESSING.FXAAEffect()
  var bloom = new POSTPROCESSING.BloomEffect({ intensity: 0.3, radius: 0.5, threshold: 0.2 })
  var noise = new POSTPROCESSING.NoiseEffect({ blendFunction: POSTPROCESSING.BlendFunction.ADD, premultiply: true })
  noise.granularity = 0.7
  var effectPass = new POSTPROCESSING.EffectPass(camera, fxaa, bloom, noise)
  composer.addPass(renderPass)
  composer.addPass(effectPass)
  var planeGeo = new THREE.PlaneGeometry(80, 40, 200, 100)
  var oceanMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x5c001e) },
      uColorB: { value: new THREE.Color(0xb8860b) }
    },
    vertexShader: `
      precision highp float;
      uniform float uTime;
      varying float vH;
      vec3 mod289(vec3 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
      vec2 mod289(vec2 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
      vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187,0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g = vec3(a0.x * x0.x + h.x * x0.y, a0.y * x12.x + h.y * x12.y, a0.z * x12.z + h.z * x12.w);
        return 130.0 * dot(m, g);
      }
      void main(){
        vec3 p = position;
        float n = snoise(vec2(p.x*0.08 + uTime*0.4, p.y*0.08 - uTime*0.35));
        float n2 = snoise(vec2(p.x*0.02 - uTime*0.1, p.y*0.02 + uTime*0.12));
        float h = n*1.8 + n2*0.8;
        vH = h;
        p.z = h;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying float vH;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      void main(){
        float a = smoothstep(-2.0, 2.0, vH);
        vec3 c = mix(uColorA, uColorB, a);
        float o = 0.65;
        gl_FragColor = vec4(c, o);
      }
    `
  })
  var ocean = new THREE.Mesh(planeGeo, oceanMat)
  ocean.rotation.x = -Math.PI/2
  ocean.position.y = -6
  scene.add(ocean)
  var pointsCountX = 220
  var pointsCountY = 110
  var geom = new THREE.BufferGeometry()
  var positions = new Float32Array(pointsCountX*pointsCountY*3)
  var idx = 0
  for (var y=0;y<pointsCountY;y++){
    for (var x=0;x<pointsCountX;x++){
      positions[idx++] = (x/pointsCountX - 0.5) * 80.0
      positions[idx++] = 0.3
      positions[idx++] = (y/pointsCountY - 0.5) * 40.0
    }
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  var ptsMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBase: { value: new THREE.Color(0xb8860b) } },
    vertexShader: `
      precision highp float;
      uniform float uTime;
      attribute vec3 position;
      varying float vA;
      vec3 mod289(vec3 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
      vec2 mod289(vec2 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
      vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
      float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187,0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g = vec3(a0.x * x0.x + h.x * x0.y, a0.y * x12.x + h.y * x12.y, a0.z * x12.z + h.z * x12.w);
        return 130.0 * dot(m, g);
      }
      void main(){
        vec3 p = position;
        float n = snoise(vec2(p.x*0.07 + uTime*0.6, p.z*0.07 - uTime*0.55));
        p.y += n*0.8;
        vA = smoothstep(-0.8, 1.2, n);
        gl_PointSize = 1.8 + vA*2.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
     fragmentShader: `
       precision highp float;
       varying float vA;
       uniform vec3 uBase;
       void main(){
         float d = length(gl_PointCoord.xy - 0.5);
         float m = smoothstep(0.5, 0.0, d);
         vec3 lighterColor = uBase * 1.3;  // lighter purple
         vec3 c = mix(uBase, lighterColor, vA);
         gl_FragColor = vec4(c, m * 0.9);
       }
     `
  })
  var points = new THREE.Points(geom, ptsMat)
  points.position.y = 2.2
  scene.add(points)
  var clock = new THREE.Clock()
  function resize(){
    var w = root.clientWidth, h = root.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
  }
  window.addEventListener('resize', resize)
  resize()
  function loop(){
    var t = clock.getElapsedTime()
    oceanMat.uniforms.uTime.value = t
    ptsMat.uniforms.uTime.value = t
    composer.render()
    requestAnimationFrame(loop)
  }
  loop()
})()
