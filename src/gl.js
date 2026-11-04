/* LUMEN PRO · pipeline WebGL2: LUT 3D reales, ajustes, máscaras, detalle y efectos */
const VS = `#version 300 es
in vec2 aPos; out vec2 vUv; uniform float uFlip;
void main(){ vUv=aPos; gl_Position=vec4(aPos.x*2.-1.,(1.-aPos.y*2.)*uFlip,0.,1.); }`;

const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uSrc,uMask,uCurve,uBlurS,uBlurM,uMatte,uBgS; uniform vec2 uBandTap;
uniform float uProOn,uProSubj,uProBg,uProBgSat,uProFill,uProFace,uProSkin,uBgBlur,uFeet,uPersonH; uniform sampler3D uLut;
uniform vec4 uTile,uSub; uniform mat3 uSrcXf,uMaskXf; uniform vec2 uTap,uOutSize;
uniform float uLowPass,uIdentity,uLutOn,uLutMix,uLutSize,uTetra,uDither,uSplit,uShowMask,uHasBlur,uAspect;
uniform float uExp,uCon,uHi,uSh,uWh,uBl,uTemp,uTint,uVib,uSat,uHslOn,uCurveOn,uGradeOn,uSkinProt;
uniform vec3 uHsl[8],uGs,uGm,uGh,uAtmos; uniform vec4 uMkP,uMkS,uMkB; uniform float uMaskOn;
uniform float uSharp,uClar,uTex,uNoise,uHaze,uVig,uGrain,uHal,uGrainSize,uFade,uWbOn; uniform vec3 uWb;
const vec3 LW=vec3(.2126,.7152,.0722);
float luma(vec3 c){return dot(c,LW);}
vec3 s2l(vec3 c){c=max(c,vec3(0.));return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
vec3 l2s(vec3 c){c=max(c,vec3(0.));return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
vec3 rgb2hsl(vec3 c){float a=max(c.r,max(c.g,c.b)),b=min(c.r,min(c.g,c.b)),l=(a+b)*.5,d=a-b,h=0.,s=0.;
 if(d>1e-5){s=d/(1.-abs(2.*l-1.)+1e-5);
  if(a==c.r)h=mod((c.g-c.b)/d,6.);else if(a==c.g)h=(c.b-c.r)/d+2.;else h=(c.r-c.g)/d+4.;h/=6.;}
 return vec3(h,clamp(s,0.,1.),l);}
vec3 hsl2rgb(vec3 c){vec3 r=clamp(abs(mod(c.x*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);return c.z+c.y*(r-.5)*(1.-abs(2.*c.z-1.));}
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec3 lutFetch(ivec3 p){return texelFetch(uLut,p,0).rgb;}
vec3 lutTetra(vec3 c){float n=uLutSize-1.;vec3 p=clamp(c,0.,1.)*n;vec3 b=min(floor(p),vec3(n-1.));vec3 f=p-b;ivec3 i=ivec3(b);
 vec3 c0=lutFetch(i),c1=lutFetch(i+1),r;
 if(f.r>=f.g){
  if(f.g>=f.b) r=c0*(1.-f.r)+lutFetch(i+ivec3(1,0,0))*(f.r-f.g)+lutFetch(i+ivec3(1,1,0))*(f.g-f.b)+c1*f.b;
  else if(f.r>=f.b) r=c0*(1.-f.r)+lutFetch(i+ivec3(1,0,0))*(f.r-f.b)+lutFetch(i+ivec3(1,0,1))*(f.b-f.g)+c1*f.g;
  else r=c0*(1.-f.b)+lutFetch(i+ivec3(0,0,1))*(f.b-f.r)+lutFetch(i+ivec3(1,0,1))*(f.r-f.g)+c1*f.g;
 }else{
  if(f.b>=f.g) r=c0*(1.-f.b)+lutFetch(i+ivec3(0,0,1))*(f.b-f.g)+lutFetch(i+ivec3(0,1,1))*(f.g-f.r)+c1*f.r;
  else if(f.b>=f.r) r=c0*(1.-f.g)+lutFetch(i+ivec3(0,1,0))*(f.g-f.b)+lutFetch(i+ivec3(0,1,1))*(f.b-f.r)+c1*f.r;
  else r=c0*(1.-f.g)+lutFetch(i+ivec3(0,1,0))*(f.g-f.r)+lutFetch(i+ivec3(1,1,0))*(f.r-f.b)+c1*f.b;
 }
 return r;}
vec3 applyLut(vec3 c){
 if(uTetra>.5)return lutTetra(c);
 return texture(uLut,(clamp(c,0.,1.)*(uLutSize-1.)+.5)/uLutSize).rgb;}
vec3 baseAdjust(vec3 c){
 if(uWbOn>.5)c=l2s(s2l(c)*uWb);
 if(uExp!=0.)c=l2s(s2l(c)*pow(2.,uExp));
 if(uBl!=0.||uWh!=0.){float bp=-uBl*.12,wp=1.-uWh*.28;c=(c-bp)/max(wp-bp,.05);}
 c=max(c,vec3(0.));
 if(uCon!=0.){vec3 q=clamp(c,0.,1.);c+=sin(q*6.28318)*(-.155*uCon);}
 if(uHi!=0.||uSh!=0.){float L=clamp(luma(c),0.,1.);float mh=smoothstep(.4,1.,L),ms=1.-smoothstep(0.,.55,L);
  float dl=uHi*.3*mh+uSh*.3*ms;c=max(c+dl*(.4+.6*c/max(L,.05)),vec3(0.));}
 return c;}
vec3 colorStage(vec3 c,vec3 ref,vec4 mask){
 if(uTemp!=0.||uTint!=0.){vec3 g=vec3(1.+uTemp*.22-uTint*.06,1.+uTint*.14,1.-uTemp*.26-uTint*.06);vec3 l=s2l(c);float y=luma(l);l*=g;l*=y/max(luma(l),1e-4);c=l2s(l);}
 if(uVib!=0.||uSat!=0.){float y=luma(c);float a=max(c.r,max(c.g,c.b)),b=min(c.r,min(c.g,c.b));float s=a-b;float v=uVib>0.?uVib*(1.-smoothstep(.1,.9,s))*(1.-mask.a*.7):uVib;
  c=y+(c-y)*(1.+uSat)*(1.+v);}
 if(uHslOn>.5){vec3 h=rgb2hsl(clamp(c,0.,1.));float deg=h.x*360.,sa=h.y;vec3 acc=vec3(0.);float tw=0.;
  const float C[8]=float[8](0.,30.,60.,120.,180.,225.,270.,315.);const float W[8]=float[8](22.,22.,28.,45.,40.,35.,35.,35.);
  for(int i=0;i<8;i++){float d=abs(mod(deg-C[i]+180.,360.)-180.);float w=max(0.,1.-d/W[i]);w=w*w*(3.-2.*w);acc+=uHsl[i]*w;tw+=w;}
  float sw=smoothstep(.02,.18,sa);acc*=sw;
  h.x=fract(h.x+acc.x*.085+1.);h.y=clamp(h.y*(1.+acc.y),0.,1.);h.z=clamp(h.z+acc.z*.22*(1.-abs(2.*h.z-1.)),0.,1.);c=hsl2rgb(h);}
 if(uCurveOn>.5){vec3 q=clamp(c,0.,1.);q=vec3(texture(uCurve,vec2(q.r,.5)).r,texture(uCurve,vec2(q.g,.5)).g,texture(uCurve,vec2(q.b,.5)).b);
  c=vec3(texture(uCurve,vec2(q.r,.5)).a,texture(uCurve,vec2(q.g,.5)).a,texture(uCurve,vec2(q.b,.5)).a);}
 if(uGradeOn>.5){float L=clamp(luma(c),0.,1.);float ws=pow(1.-L,2.),wh=L*L,wm=1.-ws-wh;c+=uGs*ws+uGm*wm+uGh*wh;}
 if(uFade>0.)c=uFade+clamp(c,0.,1.)*(1.-uFade*1.25);
 if(uSkinProt>0.){float y=luma(c);vec3 r=ref*(y/max(luma(ref),1e-4));c=mix(c,r,uSkinProt*mask.a*.75);}
 return c;}
vec3 local(vec3 c,vec4 p,float w){ if(w<=.001)return c;
 vec3 o=c;
 if(p.x!=0.)o=l2s(s2l(o)*pow(2.,p.x));
 if(p.y!=0.){vec3 q=clamp(o,0.,1.);o+=sin(q*6.28318)*(-.155*p.y);}
 if(p.z!=0.){float y=luma(o);o=y+(o-y)*(1.+p.z);}
 if(p.w!=0.){vec3 l=s2l(o);float y=luma(l);l*=vec3(1.+p.w*.22,1.,1.-p.w*.26);l*=y/max(luma(l),1e-4);o=l2s(l);}
 return mix(c,o,w);}
void main(){
 vec2 ou=uTile.xy+vUv*uTile.zw;
 vec2 sg=(uSrcXf*vec3(ou,1.)).xy; vec2 su=(sg-uSub.xy)/uSub.zw;
 vec4 src=texture(uSrc,su);
 if(uIdentity>.5||(uSplit>=0.&&ou.x<uSplit)){fragColor=src;return;}
 vec3 c=src.rgb;
 if(uNoise>0.&&uLowPass<.5){vec3 a=c*1.;float tw=1.;float sc=.015+uNoise*.11;float yc=luma(c);
  for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){if(i==0&&j==0)continue;
   vec3 q=texture(uSrc,su+vec2(float(i),float(j))*uTap).rgb;vec3 df=q-c;float w=exp(-dot(df,df)/(2.*sc*sc))*exp(-float(i*i+j*j)/5.);a+=q*w;tw+=w;}
  c=mix(c,a/tw,min(1.,uNoise*1.5));}
 float dS=0.;
 if(uSharp>0.&&uLowPass<.5){float n=luma(texture(uSrc,su+vec2(uTap.x,0.)).rgb)+luma(texture(uSrc,su-vec2(uTap.x,0.)).rgb)+luma(texture(uSrc,su+vec2(0.,uTap.y)).rgb)+luma(texture(uSrc,su-vec2(0.,uTap.y)).rgb);
  dS=luma(c)-n*.25;}
 vec2 mu=(uMaskXf*vec3(ou,1.)).xy; vec4 mask=uMaskOn>.5?texture(uMask,mu):vec4(0.);
 vec3 base0=c;
 c=baseAdjust(c);
 vec3 ref=c;
 if(uLutOn>.5&&uLutMix>0.)c=mix(c,applyLut(c),uLutMix);
 c=colorStage(c,ref,mask);
 if(uMaskOn>.5){c=local(c,uMkP,mask.r);c=local(c,uMkS,mask.g);c=local(c,uMkB,mask.b);}
 vec4 mt=vec4(0.);
 if(uProOn>.5){mt=texture(uMatte,mu);float m=mt.r;float y0=clamp(luma(c),0.,1.);float prot=1.-smoothstep(.72,1.,y0);
  float ev=(uProSubj*m+uProFace*mt.g)*prot+uProBg*(1.-m);
  if(ev!=0.)c=l2s(s2l(c)*pow(2.,ev));
  c+=m*uProFill*pow(1.-y0,3.);
  if(uProBgSat!=0.){float y=luma(c);c=y+(c-y)*(1.+uProBgSat*(1.-m));}}
 if(uLowPass>.5){c=clamp(c,0.,1.);fragColor=vec4(c,min(c.r,min(c.g,c.b)));return;}
 if(uHasBlur>.5){
  vec4 bM=texture(uBlurM,ou),bS=texture(uBlurS,ou);float y=luma(c);
  /* A más de 1600 px, el detalle más fino no se amplifica: la exportación se ve como la vista previa */
  float yb=y;
  if(uBandTap.x>0.&&(uTex!=0.||uClar!=0.)){vec2 t=uBandTap;
   float a=luma(texture(uSrc,su+vec2(t.x,0.)).rgb)+luma(texture(uSrc,su-vec2(t.x,0.)).rgb)+luma(texture(uSrc,su+vec2(0.,t.y)).rgb)+luma(texture(uSrc,su-vec2(0.,t.y)).rgb);
   float d=luma(texture(uSrc,su+t*.7).rgb)+luma(texture(uSrc,su-t*.7).rgb)+luma(texture(uSrc,su+vec2(t.x,-t.y)*.7).rgb)+luma(texture(uSrc,su+vec2(-t.x,t.y)*.7).rgb);
   yb=y-(luma(src.rgb)-(a+d)*.125);}
  if(uTex!=0.)c+=(yb-luma(bS.rgb))*uTex*1.5;
  if(uClar!=0.){float mm=1.-pow(abs(2.*y-1.),2.);c+=(yb-luma(bM.rgb))*uClar*1.4*mm;}
  if(uHaze>0.){float t=max(1.-.92*uHaze*bM.a/max(max(uAtmos.r,max(uAtmos.g,uAtmos.b)),.2),.22);c=(c-uAtmos)/t+uAtmos;}
  else if(uHaze<0.)c=mix(c,uAtmos,-uHaze*.45);
  if(uHal>0.){float h=max(luma(bM.rgb)-.62,0.)*2.6;c+=vec3(1.,.36,.14)*h*uHal*.55;}
  /* Piel: quita manchas de escala media y conserva la textura fina */
  if(uProOn>.5&&uProSkin>0.){vec3 d=bS.rgb-bM.rgb;float a=1.-smoothstep(.035,.11,abs(luma(d)));c-=d*uProSkin*mt.g*a;}
 }
 if(uSharp>0.){float g=clamp(dS*uSharp*4.,-.14,.14);c+=g;}
 /* Fondo desenfocado: el suelo junto a los pies sigue enfocado, como con un lente real */
 if(uProOn>.5&&uBgBlur>0.){float dep=1.;
  if(uFeet>=0.){float dy=mu.y-uFeet,h=max(uPersonH,.08);dep=dy<0.?smoothstep(0.,h*.45,-dy):smoothstep(0.,h*.8,dy)*.75;}
  float a=uBgBlur*dep;vec4 p1=texture(uBgS,ou);
  /* Disco de lente: las luces del fondo se abren en círculos, no en una mancha */
  vec2 rad=vec2(uAspect>=1.?1.:1./uAspect,uAspect>=1.?uAspect:1.)*.024;vec4 p2=p1*.8;
  const vec2 D[18]=vec2[18](vec2(1.,0.),vec2(.94,.34),vec2(.77,.64),vec2(.5,.87),vec2(.17,.98),vec2(-.17,.98),vec2(-.5,.87),vec2(-.77,.64),vec2(-.94,.34),vec2(-1.,0.),vec2(-.94,-.34),vec2(-.77,-.64),vec2(-.5,-.87),vec2(-.17,-.98),vec2(.17,-.98),vec2(.5,-.87),vec2(.77,-.64),vec2(.94,-.34));
  for(int i=0;i<18;i++){p2+=texture(uBgS,ou+D[i]*rad);p2+=texture(uBgS,ou+D[(i*5+3)%18]*rad*.55);}
  vec3 f1=l2s(p1.rgb/max(p1.a,.002)),f2=l2s(p2.rgb/max(p2.a,.002));
  vec3 bg=mix(c,f1,clamp(a*2.,0.,1.));bg=mix(bg,f2,clamp(a*2.-1.,0.,1.));
  vec2 q=ou*uOutSize;bg+=(hash(q+11.3)+hash(q+47.9)-1.)*.012*a;
  c=mix(bg,c,mt.r);}
 if(uVig!=0.){vec2 d=(ou-.5)*vec2(uAspect>1.?1.:uAspect,uAspect>1.?1./uAspect:1.)*1.414;float r=dot(d,d);float v=smoothstep(.18,1.05,r);
  if(uVig<0.)c*=1.+uVig*v*1.05;else c=mix(c,vec3(1.),uVig*v*.8);}
 if(uGrain>0.){vec2 px=ou*uOutSize/uGrainSize;vec2 ip=floor(px),fp=px-ip;fp=fp*fp*(3.-2.*fp);
  float a=hash(ip),b=hash(ip+vec2(1.,0.)),e=hash(ip+vec2(0.,1.)),f=hash(ip+vec2(1.,1.));
  float a2=hash(ip+17.3),b2=hash(ip+vec2(18.3,17.3)),e2=hash(ip+vec2(17.3,18.3)),f2=hash(ip+18.3);
  float n=mix(mix(a,b,fp.x),mix(e,f,fp.x),fp.y)+mix(mix(a2,b2,fp.x),mix(e2,f2,fp.x),fp.y)-1.;
  float y=clamp(luma(c),0.,1.);c+=n*uGrain*.2*(.35+.65*(1.-pow(abs(2.*y-1.),2.)));}
 if(uShowMask>0.){float m=uShowMask<1.5?mask.r:uShowMask<2.5?mask.g:uShowMask<3.5?mask.b:mask.a;c=mix(c,vec3(.95,.72,.1),m*.6);}
 if(uDither>.5){vec2 q=ou*uOutSize;float t=hash(q+3.7)+hash(q+71.1)-1.;c+=t/255.;}
 fragColor=vec4(clamp(c,0.,1.),src.a);
}`;

/* Prepara el fondo para desenfocar: quita a la persona y trabaja en luz lineal, sin halos alrededor */
const FS_PREM = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uT,uMatte; uniform mat3 uMaskXf;
vec3 s2l(vec3 c){c=max(c,vec3(0.));return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c));}
void main(){vec2 mu=(uMaskXf*vec3(vUv,1.)).xy;float m=texture(uMatte,mu).r;float w=1.-smoothstep(.02,.3,m);o=vec4(s2l(texture(uT,vUv).rgb)*w,w);}`;

const FS_BLUR = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform vec2 uDir; uniform float uSigma;
void main(){vec4 s=vec4(0.);float t=0.;for(int i=-12;i<=12;i++){float f=float(i);float w=exp(-f*f/(2.*uSigma*uSigma));s+=texture(uT,vUv+uDir*f)*w;t+=w;}o=s/t;}`;

class Renderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 4;
    this.onRestored = null;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; if (this.onLost) this.onLost(); });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); if (this.onRestored) this.onRestored(); });
    this.init();
  }
  init() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('Este navegador no tiene WebGL2. Abre LUMEN PRO en una versión reciente de Chrome, Edge, Firefox o Safari.');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.main = this.program(FS_MAIN);
    this.blur = this.program(FS_BLUR);
    this.prem = this.program(FS_PREM);
    this.matteTex = null;
    this.matte = null;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.DITHER);
    this.luts = new Map();
    this.lutClock = 0;
    this.white = this.tex2D(1, 1, new Uint8Array([0, 0, 0, 0]));
    this.lutIdentity = this.upload3D({ size: 2, data: new Uint8Array([0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 0, 255, 0, 0, 255, 255, 255, 0, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255]) });
    this.curveTex = gl.createTexture();
    this.curveKey = '';
    this.setCurves(Core.defaultParams().curves);
    this.maskTex = this.white;
    this.maskData = null;
    this.low = null;
    this.lows = null;
  }
  program(fs) {
    const gl = this.gl;
    const sh = (t, src) => {
      const s = gl.createShader(t);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('Error de shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('Error de programa: ' + gl.getProgramInfoLog(p));
    return { p, u: new Map() };
  }
  loc(pr, n) { if (!pr.u.has(n)) pr.u.set(n, this.gl.getUniformLocation(pr.p, n)); return pr.u.get(n); }
  tex2D(w, h, data, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.params2D(filter);
    return t;
  }
  params2D(filter) {
    const gl = this.gl, f = filter || gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  /* Sube ImageBitmap/canvas conservando sus valores RGB */
  uploadImage(img, prev) {
    const gl = this.gl;
    if (prev) gl.deleteTexture(prev);
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.params2D();
    return t;
  }
  upload3D(lut) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, t);
    const n = lut.size;
    if (lut.data instanceof Float32Array) gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, lut.data);
    else gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
    return t;
  }
  /* Caché LRU: pocas LUT en memoria de GPU */
  bindLut(id, loader) {
    let e = this.luts.get(id);
    if (!e) {
      const lut = loader();
      if (!lut) return null;
      e = { tex: this.upload3D(lut), size: lut.size };
      this.luts.set(id, e);
      if (this.luts.size > 8) {
        let old = null, oldT = Infinity;
        for (const [k, v] of this.luts) if (k !== id && v.t < oldT) { old = k; oldT = v.t; }
        if (old !== null) { this.gl.deleteTexture(this.luts.get(old).tex); this.luts.delete(old); }
      }
    }
    e.t = ++this.lutClock;
    return e;
  }
  hasLut(id) { return this.luts.has(id); }
  setCurves(cv) {
    const key = JSON.stringify(cv);
    if (key === this.curveKey) return;
    this.curveKey = key;
    const gl = this.gl;
    const r = Core.curveToTable(cv.r), g = Core.curveToTable(cv.g), b = Core.curveToTable(cv.b), m = Core.curveToTable(cv.rgb);
    const d = new Float32Array(256 * 4);
    for (let i = 0; i < 256; i++) { d[i * 4] = r[i]; d[i * 4 + 1] = g[i]; d[i * 4 + 2] = b[i]; d[i * 4 + 3] = m[i]; }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 256, 1, 0, gl.RGBA, gl.FLOAT, d);
    this.params2D();
  }
  setMask(data, w, h) {
    const gl = this.gl;
    if (this.maskTex && this.maskTex !== this.white) gl.deleteTexture(this.maskTex);
    this.maskData = data ? { data, w, h } : null;
    if (!data) { this.maskTex = this.white; return; }
    gl.activeTexture(gl.TEXTURE3);
    this.maskTex = this.tex2D(w, h, data);
  }
  /* Recorte de la persona en alta resolución: R persona, G piel, B rostro */
  setMatte(info) {
    const gl = this.gl;
    if (this.matteTex) { gl.deleteTexture(this.matteTex); this.matteTex = null; }
    this.matte = info || null;
    if (!info) return;
    gl.activeTexture(gl.TEXTURE8);
    this.matteTex = this.tex2D(info.w, info.h, info.data);
  }
  proActive(p) { return !!(this.matteTex && p.pro && p.pro.amount); }
  fbo(w, h) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (this.floatOK) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.params2D();
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, f, w, h };
  }
  ensureLow(aspect, long) {
    const key = `${aspect.toFixed(4)}|${long}`;
    if (!this.lows) this.lows = new Map();
    let low = this.lows.get(key);
    if (low) { this.low = low; return low; }
    if (this.lows.size >= 3) {
      const oldKey = this.lows.keys().next().value, old = this.lows.get(oldKey);
      for (const k of ['l', 's1', 's2', 'm1', 'm2', 'p', 'b1', 'b2']) if (old[k]) { this.gl.deleteTexture(old[k].t); this.gl.deleteFramebuffer(old[k].f); }
      this.lows.delete(oldKey);
    }
    const dim = (n) => (aspect >= 1 ? [n, Math.max(4, Math.round(n / aspect))] : [Math.max(4, Math.round(n * aspect)), n]);
    const [lw, lh] = dim(long), [mw, mh] = dim(Math.max(32, Math.round(long / 4)));
    low = { key, long, dim, l: this.fbo(lw, lh), s1: this.fbo(lw, lh), s2: this.fbo(lw, lh), m1: this.fbo(mw, mh), m2: this.fbo(mw, mh) };
    this.lows.set(key, low);
    this.low = low;
    return low;
  }
  blurPass(from, to, dx, dy, sigma) {
    const gl = this.gl, pr = this.blur;
    gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.f);
    gl.viewport(0, 0, to.w, to.h);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, from.t);
    gl.uniform1i(this.loc(pr, 'uT'), 7);
    gl.uniform2f(this.loc(pr, 'uDir'), dx, dy);
    gl.uniform1f(this.loc(pr, 'uSigma'), sigma);
    gl.uniform1f(this.loc(pr, 'uFlip'), -1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  setColorUniforms(pr, p, opt) {
    const gl = this.gl, u1 = (n, v) => gl.uniform1f(this.loc(pr, n), v);
    const pct = (v) => v / 100;
    const wb = p._wb || [1, 1, 1];
    u1('uWbOn', wb[0] !== 1 || wb[1] !== 1 || wb[2] !== 1 ? 1 : 0);
    gl.uniform3f(this.loc(pr, 'uWb'), wb[0], wb[1], wb[2]);
    u1('uFade', p._fade || 0);
    u1('uExp', p.light.exposure); u1('uCon', pct(p.light.contrast)); u1('uHi', pct(p.light.highlights)); u1('uSh', pct(p.light.shadows));
    u1('uWh', pct(p.light.whites)); u1('uBl', pct(p.light.blacks));
    u1('uTemp', pct(p.color.temp)); u1('uTint', pct(p.color.tint)); u1('uVib', pct(p.color.vibrance)); u1('uSat', pct(p.color.saturation));
    const h = p.color.hsl;
    const hslOn = h.h.some(Boolean) || h.s.some(Boolean) || h.l.some(Boolean);
    u1('uHslOn', hslOn ? 1 : 0);
    if (hslOn) {
      const a = new Float32Array(24);
      for (let i = 0; i < 8; i++) { a[i * 3] = h.h[i] / 100; a[i * 3 + 1] = h.s[i] / 100; a[i * 3 + 2] = h.l[i] / 100; }
      gl.uniform3fv(this.loc(pr, 'uHsl'), a);
    }
    const id = '[[0,0],[1,1]]', cv = p.curves, curveOn = [cv.rgb, cv.r, cv.g, cv.b].some((c) => JSON.stringify(c) !== id);
    u1('uCurveOn', curveOn ? 1 : 0);
    if (curveOn) this.setCurves(cv);
    const tint = (g) => {
      const s = g.s / 100, a = (g.h * Math.PI) / 180;
      const r = Math.cos(a), gg = Math.cos(a - 2.0944), b = Math.cos(a - 4.18879);
      return [r * s * 0.16, gg * s * 0.16, b * s * 0.16];
    };
    const gOn = p.grade.shadows.s || p.grade.mids.s || p.grade.highs.s;
    u1('uGradeOn', gOn ? 1 : 0);
    gl.uniform3fv(this.loc(pr, 'uGs'), tint(p.grade.shadows));
    gl.uniform3fv(this.loc(pr, 'uGm'), tint(p.grade.mids));
    gl.uniform3fv(this.loc(pr, 'uGh'), tint(p.grade.highs));
    const mk = (m) => [m.exposure, m.contrast / 100, m.saturation / 100, m.temp / 100];
    gl.uniform4fv(this.loc(pr, 'uMkP'), mk(p.masks.person));
    gl.uniform4fv(this.loc(pr, 'uMkS'), mk(p.masks.sky));
    gl.uniform4fv(this.loc(pr, 'uMkB'), mk(p.masks.background));
    u1('uSkinProt', pct(p.masks.skinProtect));
    const mOn = this.maskData && (['person', 'sky', 'background'].some((k) => Object.values(p.masks[k]).some(Boolean)) || p.masks.skinProtect > 0 || opt.showMask || p.color.vibrance);
    u1('uMaskOn', mOn ? 1 : 0);
    u1('uShowMask', opt.showMask || 0);
    const pro = this.proActive(p), a = pro ? p.pro.amount / 100 : 0, info = this.matte || {};
    u1('uProOn', pro ? 1 : 0);
    if (pro) {
      const s = a * p.pro.subject / 100;
      u1('uProSubj', s * ((info.subjEv || 0) + 0.12)); u1('uProBg', -s * 0.08); u1('uProBgSat', s * 0.05); u1('uProFill', s * 0.06);
      u1('uProFace', a * (p.pro.face / 100) * ((info.faceEv || 0) + 0.1)); u1('uProSkin', a * (p.pro.skin / 100) * 0.8);
      u1('uBgBlur', a * p.pro.blur / 100); u1('uFeet', info.feet === undefined ? -1 : info.feet); u1('uPersonH', info.personH || 1);
    } else { u1('uProSkin', 0); u1('uBgBlur', 0); }
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, pro ? this.matteTex : this.white);
    gl.uniform1i(this.loc(pr, 'uMatte'), 8);
    gl.uniformMatrix3fv(this.loc(pr, 'uMaskXf'), false, Renderer.mat(opt.maskXf || Core.IDENTITY_XF));
    const mix = p._lutMix === undefined ? opt.intensity / 100 : p._lutMix;
    const lutOn = !!(opt.lut && mix > 0);
    u1('uLutOn', lutOn ? 1 : 0);
    u1('uLutMix', mix);
    u1('uLutSize', opt.lut ? opt.lut.size : 2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, opt.lut ? opt.lut.tex : this.lutIdentity);
    gl.uniform1i(this.loc(pr, 'uLut'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.uniform1i(this.loc(pr, 'uCurve'), 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.loc(pr, 'uMask'), 3);
  }
  static mat(m) { return new Float32Array([m[0], m[3], 0, m[1], m[4], 0, m[2], m[5], 1]); }
  /* Pasadas de baja resolución para claridad, textura, neblina y halación */
  updateBlur(job, aspect) {
    const gl = this.gl, long = job.outW * job.outH < 200000 ? 256 : 1024, low = this.ensureLow(aspect, long), pr = this.main;
    /* Evita leer y escribir la misma textura en esta pasada */
    for (const unit of [gl.TEXTURE4, gl.TEXTURE5, gl.TEXTURE9]) { gl.activeTexture(unit); gl.bindTexture(gl.TEXTURE_2D, this.white); }
    gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, low.l.f);
    gl.viewport(0, 0, low.l.w, low.l.h);
    this.setColorUniforms(pr, job.params, job);
    this.bindSource(pr, job.lowSrc || job.src);
    const u1 = (n, v) => gl.uniform1f(this.loc(pr, n), v);
    u1('uLowPass', 1); u1('uIdentity', 0); u1('uTetra', 0); u1('uDither', 0); u1('uSplit', -1); u1('uHasBlur', 0);
    u1('uNoise', 0); u1('uSharp', 0); u1('uFlip', -1);
    gl.uniform4f(this.loc(pr, 'uTile'), 0, 0, 1, 1);
    gl.uniformMatrix3fv(this.loc(pr, 'uSrcXf'), false, Renderer.mat(job.lowXf || job.srcXf || Core.IDENTITY_XF));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const sigS = Math.max(0.7, 3.1 * long / 1024), sigM = 3.8;
    this.blurPass(low.l, low.s1, 1 / low.l.w, 0, sigS);
    this.blurPass(low.s1, low.s2, 0, 1 / low.l.h, sigS);
    this.blurPass(low.l, low.m1, 1 / low.m1.w, 0, sigM);
    this.blurPass(low.m1, low.m2, 0, 1 / low.m1.h, sigM);
    if (this.proActive(job.params)) this.updateBackground(job, low);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return low;
  }
  updateBackground(job, low) {
    const gl = this.gl, pr = this.prem;
    if (!low.p) {
      const [hw, hh] = low.dim(Math.max(16, low.long >> 1));
      Object.assign(low, { p: this.fbo(hw, hh), b1: this.fbo(hw, hh), b2: this.fbo(hw, hh) });
    }
    gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, low.p.f);
    gl.viewport(0, 0, low.p.w, low.p.h);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, low.l.t); gl.uniform1i(this.loc(pr, 'uT'), 7);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, this.matteTex); gl.uniform1i(this.loc(pr, 'uMatte'), 8);
    gl.uniformMatrix3fv(this.loc(pr, 'uMaskXf'), false, Renderer.mat(job.maskXf || Core.IDENTITY_XF));
    gl.uniform1f(this.loc(pr, 'uFlip'), -1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.blurPass(low.p, low.b1, 1 / low.p.w, 0, 2.2);
    this.blurPass(low.b1, low.b2, 0, 1 / low.p.h, 2.2);
  }
  bindSource(pr, src) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    const f = src.nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.uniform1i(this.loc(pr, 'uSrc'), 0);
    const sub = src.sub || [0, 0, 1, 1];
    gl.uniform4f(this.loc(pr, 'uSub'), sub[0], sub[1], sub[2], sub[3]);
  }
  /* job: {src:{tex,w,h,sub?,nearest?}, lowSrc?, srcXf, lowXf?, maskXf, params, lut, intensity, outW,outH, tile:[x,y,w,h], pxW,pxH, tetra, dither, split, showMask, atmos} */
  render(job) {
    const gl = this.gl, pr = this.main;
    if (gl.isContextLost()) return false;
    const raw = job.params, p = Core.effectiveParams(raw, job.intensity);
    job = { ...job, params: p };
    const c = this.canvas;
    if (c.width !== job.pxW || c.height !== job.pxH) { c.width = job.pxW; c.height = job.pxH; }
    const aspect = job.outW / job.outH;
    const identity = Core.colorIsIdentity({ ...raw, intensity: job.intensity }) && !job.showMask;
    const d = p.detail, fx = p.fx;
    const pro = this.proActive(p);
    const needBlur = !identity && (d.clarity || d.texture || d.dehaze || fx.halation || pro);
    if (needBlur) this.updateBlur(job, aspect);
    gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, job.pxW, job.pxH);
    this.setColorUniforms(pr, p, job);
    this.bindSource(pr, job.src);
    const u1 = (n, v) => gl.uniform1f(this.loc(pr, n), v);
    u1('uFlip', 1); u1('uLowPass', 0); u1('uIdentity', identity ? 1 : 0);
    u1('uTetra', job.tetra ? 1 : 0); u1('uDither', job.dither === false || identity ? 0 : 1);
    u1('uSplit', job.split === undefined || job.split === null ? -1 : job.split);
    gl.uniform4fv(this.loc(pr, 'uTile'), job.tile || [0, 0, 1, 1]);
    gl.uniformMatrix3fv(this.loc(pr, 'uSrcXf'), false, Renderer.mat(job.srcXf || Core.IDENTITY_XF));
    gl.uniform2f(this.loc(pr, 'uOutSize'), job.outW, job.outH);
    /* Toques en coordenadas de subtextura para un píxel de salida. */
    const m = job.srcXf || Core.IDENTITY_XF, sub = job.src.sub || [0, 0, 1, 1];
    const texW = job.src.w || job.outW, texH = job.src.h || job.outH;
    gl.uniform2f(this.loc(pr, 'uTap'), Math.max(Math.hypot(m[0], m[3]) / job.outW, 1 / texW) / sub[2], Math.max(Math.hypot(m[1], m[4]) / job.outH, 1 / texH) / sub[3]);
    const tl = job.tile || [0, 0, 1, 1];
    const effLong = Math.max((job.pxW / tl[2]), (job.pxH / tl[3]));
    const band = effLong / 1600;
    if (band > 1.25) gl.uniform2f(this.loc(pr, 'uBandTap'), band * Math.hypot(m[0], m[3]) / job.outW / sub[2], band * Math.hypot(m[1], m[4]) / job.outH / sub[3]);
    else gl.uniform2f(this.loc(pr, 'uBandTap'), 0, 0);
    u1('uSharp', d.sharpen / 100); u1('uClar', d.clarity / 100); u1('uTex', d.texture / 100); u1('uNoise', d.denoise / 100); u1('uHaze', d.dehaze / 100);
    u1('uVig', fx.vignette / 100 - (pro ? (p.pro.amount / 100) * (p.pro.subject / 100) * 0.07 : 0)); u1('uGrain', fx.grain / 100); u1('uHal', fx.halation / 100);
    u1('uGrainSize', Math.max(1, Math.max(job.outW, job.outH) / 1800));
    u1('uAspect', aspect);
    const at = job.atmos || [0.9, 0.9, 0.9];
    gl.uniform3f(this.loc(pr, 'uAtmos'), at[0], at[1], at[2]);
    u1('uHasBlur', needBlur ? 1 : 0);
    if (needBlur) {
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.low.s2.t); gl.uniform1i(this.loc(pr, 'uBlurS'), 4);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.low.m2.t); gl.uniform1i(this.loc(pr, 'uBlurM'), 5);
    } else {
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.white); gl.uniform1i(this.loc(pr, 'uBlurS'), 4);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.white); gl.uniform1i(this.loc(pr, 'uBlurM'), 5);
    }
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, pro && this.low && this.low.b2 ? this.low.b2.t : this.white); gl.uniform1i(this.loc(pr, 'uBgS'), 9);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
  /* Lee el canvas actual de arriba hacia abajo */
  read() {
    const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    const d = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
    const row = w * 4, tmp = new Uint8ClampedArray(row);
    for (let y = 0; y < h >> 1; y++) {
      const a = y * row, b = (h - 1 - y) * row;
      tmp.set(d.subarray(a, a + row)); d.copyWithin(a, b, b + row); d.set(tmp, b);
    }
    return d;
  }
}
