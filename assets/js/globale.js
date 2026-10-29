(function(){
  'use strict';
  var $=function(s){return document.querySelector(s)};
  var cv=$('#c'), ctx=cv.getContext('2d');
  var W=0,H=0,DPR=1;
  var FORCES={fDrift:'Dérive',fSplash:'Éclabousser',fGather:'Rassembler',fDepth:'Profondeur'};
  var S={fDrift:.5,fSplash:.35,fGather:.4,fDepth:.6,last:'fDrift',
    flow:'',track:false,links:false,scan:false,trails:false,marks:false,
    onWhite:false,neg:false,trueCol:false,lightOn:true,tint:[255,233,200],hue:false,hud:true,
    ai:false,density:80000,size:1,trkCol:null,linkCol:null,trackers:150,line:.8,cut:true,cutT:.35,axA:-.25,axB:.65,axL:.63,trkFl:.8,trkSz:1,trkSpr:1,mtrail:true,rep:.6,repR:130,retSpd:.633,retDens:1};
  var images=[], cur=0;
  var P={n:0,hx:null,hy:null,hz:null,x:null,y:null,vx:null,vy:null,ph:null,col:null,th:null,rd:null,rt:null,rk:null,hit:null};
  var TK={n:0,hx:null,hy:null,hz:null,ph:null,x:null,y:null,vx:null,vy:null,k:null,ps:null,w:null,jx:null,jy:null};
  var mouse={x:0,y:0,tx:0,ty:0,px:0,py:0,ptx:0,pty:0,last:0,rx:0,ry:0,rin:false,ptype:'mouse'};
  var trail=[];
  var cam={yaw:0,pitch:0,vy:0,vp:0,zoom:1,drag:false};
  var CM={cyw:1,syw:0,cp:1,sp:0,d:1,k:1,cx:0,cy:0};
  var PX=0,PY=0,PS=1;
  var T=0, last=performance.now(), nextSplash=3, frameNo=0, ftAvg=16, tuneAfter=150;
  var FB={img:null,u32:null,data:null,w:0,h:0};
  var bucketU32=new Uint32Array(6);
  function pack(r,g,b){return (0xFF000000|(b<<16)|(g<<8)|r)>>>0}
  var BG_D=pack(5,5,6), BG_L=pack(243,243,241);
   
  function clamp(v,a,b){return v<a?a:v>b?b:v}
  function isLight(){return S.onWhite!==S.neg}
  function bgCol(){return isLight()?'#f3f3f1':'#050506'}
  function fgRGB(){return isLight()?[12,12,14]:[236,236,240]}
   
  /* ---------- caméra 3D ---------- */
  function setCam(im,rc){
    var yaw=cam.yaw+mouse.x*.22, pit=cam.pitch+mouse.y*.14;
    CM.cyw=Math.cos(yaw);CM.syw=Math.sin(yaw);CM.cp=Math.cos(pit);CM.sp=Math.sin(pit);
    CM.d=im.w*2.4;CM.k=rc.s*cam.zoom;CM.cx=rc.ox+im.w*rc.s/2;CM.cy=rc.oy+im.h*rc.s/2;
  }
  function project(X,Y,Z){
    var x1=X*CM.cyw+Z*CM.syw, z1=-X*CM.syw+Z*CM.cyw;
    var y1=Y*CM.cp-z1*CM.sp, z2=Y*CM.sp+z1*CM.cp;
    var p=CM.d/Math.max(CM.d*.15,CM.d-z2);
    PX=CM.cx+x1*p*CM.k;PY=CM.cy+y1*p*CM.k;PS=p;
  }
  function resetCam(){cam.yaw=0;cam.pitch=0;cam.vy=0;cam.vp=0;cam.zoom=1}
   
  /* ---------- mise en page ---------- */
  function resize(){
    DPR=Math.min(window.devicePixelRatio||1,2);
    W=innerWidth;H=innerHeight;
    cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.fillStyle=bgCol();ctx.fillRect(0,0,W,H);
    FB.w=cv.width;FB.h=cv.height;FB.img=ctx.createImageData(FB.w,FB.h);FB.u32=new Uint32Array(FB.img.data.buffer);FB.data=FB.img.data;
  }
  function stageRect(){
    var bh=$('#ui').classList.contains('off')?0:$('#bottom').getBoundingClientRect().height;
    var wide=W>980;
    var top=wide?110:90, bottom=H-bh-(wide?64:44);
    var availH=Math.max(120,bottom-top), availW=W*(wide?.62:.86);
    var im=images[cur]; if(!im) return {s:1,ox:0,oy:0};
    var s=Math.min(availW/im.w,availH/im.h);
    return {s:s,ox:(W-im.w*s)/2,oy:top+(availH-im.h*s)/2};
  }
  function applyTheme(){
    var l=isLight(), r=document.documentElement.style;
    r.setProperty('--bg',l?'#f3f3f1':'#050506');
    r.setProperty('--fg',l?'#0c0c0e':'#ececf0');
    r.setProperty('--dim',l?'rgba(12,12,14,.5)':'rgba(236,236,240,.42)');
    r.setProperty('--line',l?'rgba(12,12,14,.22)':'rgba(236,236,240,.2)');
    r.setProperty('--panel',l?'rgba(243,243,241,.88)':'rgba(5,5,6,.86)');
    r.setProperty('color-scheme',l?'light':'dark');
    document.body.style.background=bgCol();
    makeBuckets();
    if(window.drawAxisReady){drawAxis();syncSwatches();}
  }
   
  /* ---------- images ---------- */
  function toImage(src,name){
    return new Promise(function(res,rej){
      var i=new Image();
      i.onload=function(){res({img:i,name:name})};
      i.onerror=rej;
      i.src=src;
    });
  }
  function analyse(img,name){
    var iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
    var sc=Math.min(1,1000/Math.max(iw,ih));
    var w=Math.max(2,Math.round(iw*sc)), h=Math.max(2,Math.round(ih*sc));
    var c=document.createElement('canvas');c.width=w;c.height=h;
    var g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(img,0,0,w,h);
    var d=g.getImageData(0,0,w,h).data;
    var lum=new Float32Array(w*h), rgb=new Uint8Array(w*h*3), al=new Uint8Array(w*h), ta=0;
    for(var i=0;i<w*h;i++){
      var r=d[i*4],gg=d[i*4+1],b=d[i*4+2];
      rgb[i*3]=r;rgb[i*3+1]=gg;rgb[i*3+2]=b;
      al[i]=d[i*4+3];if(al[i]<250)ta++;
      lum[i]=(0.2126*r+0.7152*gg+0.0722*b)/255;
    }
    (function(){
      var hist=new Uint32Array(256),k;
      for(k=0;k<lum.length;k++)hist[Math.min(255,(lum[k]*255)|0)]++;
      var lo=0,hi=255,acc=0,t2=lum.length*.02,t98=lum.length*.98;
      for(k=0;k<256;k++){acc+=hist[k];if(acc>=t2){lo=k;break;}}
      acc=0;for(k=0;k<256;k++){acc+=hist[k];if(acc>=t98){hi=k;break;}}
      if(hi-lo>12){var sc2=1/((hi-lo)/255),l0=lo/255;for(k=0;k<lum.length;k++)lum[k]=clamp((lum[k]-l0)*sc2,0,1);}
    })();
    var im={name:name,w:w,h:h,lum:lum,rgb:rgb,alpha:ta>w*h*.01?al:null,depRaw:softDepth(lum,w,h),dep:null,ai:null,aiRaw:null,mask:null,src:c};
    computeMask(im);
    return im;
  }
  /* découpe : retire le fond pour ne garder que la forme du sujet */
  function maskedStretch(a,m){
    var mn=1e9,mx=-1e9,i;
    for(i=0;i<a.length;i++){if(m[i]>.5){if(a[i]<mn)mn=a[i];if(a[i]>mx)mx=a[i];}}
    if(!(mx>mn))return stretch(a);
    var out=new Float32Array(a.length),k=mx-mn;
    for(i=0;i<a.length;i++)out[i]=clamp((a[i]-mn)/k,0,1);
    return out;
  }
  function computeMask(im){
    var w=im.w,h=im.h,n=w*h,m=new Float32Array(n),i,x,y;
    if(im.alpha){for(i=0;i<n;i++)m[i]=im.alpha[i]/255;}
    else if(!S.cut){m.fill(1);}
    else if(S.ai&&im.aiRaw){
      var dn=stretch(im.aiRaw),thr=.78-S.cutT*.62,rw=new Float32Array(n);
      for(i=0;i<n;i++)rw[i]=dn[i]>thr?1:0;
      for(y=0;y<h;y++)for(x=0;x<w;x++){
        var sm=0,ct=0;
        for(var dy2=-2;dy2<=2;dy2++)for(var dx2=-2;dx2<=2;dx2++){
          var x2=x+dx2,y2=y+dy2;
          if(x2>=0&&y2>=0&&x2<w&&y2<h){sm+=rw[y2*w+x2];ct++;}
        }
        m[y*w+x]=sm/ct;
      }
    }
    else{
      var rgb=im.rgb,sr=0,sg=0,sb=0,c=0;
      var add=function(j){sr+=rgb[j*3];sg+=rgb[j*3+1];sb+=rgb[j*3+2];c++;};
      for(x=0;x<w;x++){add(x);add((h-1)*w+x);}
      for(y=1;y<h-1;y++){add(y*w);add(y*w+w-1);}
      var mr=sr/c,mg=sg/c,mb=sb/c,tolG=12+S.cutT*140,tolL=16;
      var dG=function(j){var a=rgb[j*3]-mr,b=rgb[j*3+1]-mg,d=rgb[j*3+2]-mb;return Math.sqrt(a*a+b*b+d*d)};
      var dL=function(j,k){var a=rgb[j*3]-rgb[k*3],b=rgb[j*3+1]-rgb[k*3+1],d=rgb[j*3+2]-rgb[k*3+2];return Math.sqrt(a*a+b*b+d*d)};
      var bgm=new Uint8Array(n),st=new Int32Array(n),sp=0;
      var seed=function(j){if(!bgm[j]&&dG(j)<tolG){bgm[j]=1;st[sp++]=j;}};
      var tryN=function(j,k){if(!bgm[k]&&dG(k)<tolG&&dL(j,k)<tolL){bgm[k]=1;st[sp++]=k;}};
      for(x=0;x<w;x++){seed(x);seed((h-1)*w+x);}
      for(y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
      while(sp){
        i=st[--sp];x=i%w;y=(i/w)|0;
        if(x>0)tryN(i,i-1);if(x<w-1)tryN(i,i+1);if(y>0)tryN(i,i-w);if(y<h-1)tryN(i,i+w);
      }
      var raw=new Float32Array(n),tot=0;
      for(i=0;i<n;i++){raw[i]=bgm[i]?0:1;tot+=raw[i];}
      if(tot<n*.002){m.fill(1);}
      else{
        for(y=0;y<h;y++)for(x=0;x<w;x++){
          var sum=0,cnt=0;
          for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){
            var xx=x+dx,yy=y+dy;
            if(xx>=0&&yy>=0&&xx<w&&yy<h){sum+=raw[yy*w+xx];cnt++;}
          }
          m[y*w+x]=sum/cnt;
        }
      }
    }
    im.mask=m;
    im.dep=maskedStretch(im.depRaw,m);
    if(im.aiRaw)im.ai=maskedStretch(im.aiRaw,m);
  }
  /* profondeur de secours : luminosité lissée et étirée */
  function softDepth(lum,w,h){
    var a=new Float32Array(lum),b=new Float32Array(lum.length);
    for(var pass=0;pass<3;pass++){
      for(var y=0;y<h;y++)for(var x=0;x<w;x++){
        var s=0,n=0;
        for(var dy=-2;dy<=2;dy+=2)for(var dx=-2;dx<=2;dx+=2){
          var xx=x+dx,yy=y+dy;
          if(xx>=0&&yy>=0&&xx<w&&yy<h){s+=a[yy*w+xx];n++;}
        }
        b[y*w+x]=s/n;
      }
      var t=a;a=b;b=t;
    }
    return a;
  }
  function stretch(a){
    var mn=1e9,mx=-1e9,i;
    for(i=0;i<a.length;i++){if(a[i]<mn)mn=a[i];if(a[i]>mx)mx=a[i];}
    var out=new Float32Array(a.length),k=mx-mn||1;
    for(i=0;i<a.length;i++)out[i]=(a[i]-mn)/k;
    return out;
  }
  /* image d'exemple : ondes concentriques croisées */
  function demoImage(){
    var c=document.createElement('canvas');c.width=560;c.height=380;
    var g=c.getContext('2d'), id=g.createImageData(560,380), d=id.data;
    for(var y=0;y<380;y++)for(var x=0;x<560;x++){
      var d1=Math.hypot(x-210,y-190), d2=Math.hypot(x-350,y-170);
      var v=(Math.sin(d1*.17)+Math.sin(d2*.17))*.25+.5;
      var m=Math.max(0,1-Math.hypot((x-280)/250,(y-185)/175));
      v=v*Math.min(1,m*2.2);
      var k=(y*560+x)*4;
      d[k]=v*215+20*v;d[k+1]=v*235;d[k+2]=v*255;d[k+3]=255;
    }
    g.putImageData(id,0,0);
    return c;
  }
   
  /* photo détectée (pas de sujet isolable) : vraies couleurs, plus de points, relief doux */
  function photoLike(im){
    if(im.alpha||!im.mask)return false;
    var c=0,n=im.mask.length;
    for(var i=0;i<n;i++)if(im.mask[i]>.5)c++;
    return c/n>.7;
  }
  function autoPhoto(im){
    if(!photoLike(im))return false;
    S.trueCol=true;$('#true').setAttribute('aria-pressed','true');
    S.density=220000;$('#density').value=220000;
    S.size=.8;$('#size').value=8;
    S.fDepth=.25;$('#fDepth').value=25;
    return true;
  }
   
  /* ---------- particules ---------- */
  function build(scatter){
    var im=images[cur]; if(!im) return;
    var N=S.density, dark=!isLight();
    P.n=0;
    P.hx=new Float32Array(N);P.hy=new Float32Array(N);P.hz=new Float32Array(N);
    P.x=new Float32Array(N);P.y=new Float32Array(N);P.vx=new Float32Array(N);P.vy=new Float32Array(N);
    P.ph=new Float32Array(N);P.cu=new Uint32Array(N);
    P.th=new Float32Array(N);P.rd=new Float32Array(N);P.rt=new Float32Array(N);P.rk=new Float32Array(N);P.hit=new Float32Array(N);
    var dep=(S.ai&&im.ai)?im.ai:im.dep, rc=stageRect(), i=0, w=im.w, h=im.h, nPix=w*h, wA=new Float32Array(nPix), wsum=0, k, l, wt;
    for(k=0;k<nPix;k++){
      l=im.lum[k];
      if(!S.trueCol){ wt=dark?(.04+.96*Math.pow(l,1.35)):(.04+.96*Math.pow(1-l,1.35)); } else wt=.55+.45*(dark?l:1-l*.5);
      wt*=im.mask[k];wA[k]=wt;wsum+=wt;
    }
    var perW=wsum>0?N/wsum:0, cap=N, x, y, e, c, cnt, carry;
    /* répartition régulière : le nombre de points de chaque pixel suit son poids, le reste est reporté au pixel suivant (moins de bruit qu'un tirage aléatoire) */
    for(y=0;y<h&&i<cap;y++){
      carry=Math.random();
      for(x=0;x<w&&i<cap;x++){
        k=y*w+x;e=wA[k]*perW+carry;cnt=e|0;carry=e-cnt;
        for(c=0;c<cnt&&i<cap;c++){
          P.hx[i]=x+Math.random(); P.hy[i]=y+Math.random(); P.hz[i]=dep[k]; P.ph[i]=Math.random()*6.2832;
          P.th[i]=Math.random(); P.rd[i]=.35+Math.random()*.85; P.rt[i]=1/(5+Math.random()*9); P.rk[i]=Math.random();
          var r=im.rgb[k*3],g=im.rgb[k*3+1],b=im.rgb[k*3+2];
          if(S.neg){r=255-r;g=255-g;b=255-b;}
          P.cu[i]=pack(r,g,b);
          if(scatter){P.x[i]=W/2+(Math.random()-.5)*W*1.5;P.y[i]=H/2+(Math.random()-.5)*H*1.5;}
          else{P.x[i]=rc.ox+P.hx[i]*rc.s;P.y[i]=rc.oy+P.hy[i]*rc.s;}
          i++;
        }
      }
    }
    P.n=i;
    buildTrackers(im,rc,dep);
    updateInfo();
  }
  /* traqueurs : points indépendants, placés de préférence sur les contours et les zones claires */
  function buildTrackers(im,rc,dep){
    var N=5000,i=0,tries=0;
    TK.hx=new Float32Array(N);TK.hy=new Float32Array(N);TK.hz=new Float32Array(N);TK.ph=new Float32Array(N);
    TK.x=new Float32Array(N);TK.y=new Float32Array(N);TK.vx=new Float32Array(N);TK.vy=new Float32Array(N);TK.k=new Float32Array(N);
    TK.ps=new Float32Array(N).fill(1);TK.w=new Float32Array(N);TK.jx=new Float32Array(N);TK.jy=new Float32Array(N);
    while(i<N&&tries<N*250){
      tries++;
      var px=1+((Math.random()*(im.w-2))|0), py=1+((Math.random()*(im.h-2))|0), k=py*im.w+px;
      var e=Math.abs(im.lum[k]-im.lum[k+1])+Math.abs(im.lum[k]-im.lum[k+im.w]);
      var w=(.1+.5*(isLight()?1-im.lum[k]:im.lum[k])+Math.min(.4,e*6))*im.mask[k];
      if(Math.random()>w)continue;
      TK.hx[i]=px;TK.hy[i]=py;TK.hz[i]=dep[k];TK.ph[i]=Math.random()*6.2832;TK.k[i]=.035+Math.random()*.07;TK.w[i]=.15+Math.random()*.6;
      TK.x[i]=rc.ox+px*rc.s;TK.y[i]=rc.oy+py*rc.s;
      i++;
    }
    TK.n=i;
  }
  function updateTrackers(im,rc){
    var L=Math.min(TK.n,S.trackers);
    var cx=im.w/2, cy=im.h/2, amp=im.w*.014, ih=im.h, flow=S.flow;
    var zAmpT=im.w*S.fDepth*1.5, R=Math.max(260,Math.min(W,H)*.55);
    var kmul=3.4-2.95*S.trkFl, damp=.6+.34*S.trkFl, mcx=rc.ox+im.w*rc.s/2, mcy=rc.oy+im.h*rc.s/2, spr=S.trkSpr;
    for(var i=0;i<L;i++){
      var hx=TK.hx[i],hy=TK.hy[i],hz=TK.hz[i],ph=TK.ph[i],tx=hx,ty=hy;
      if(flow==='swarm'){var r=amp*2.4*(1.15-hz),a=T*(.35+hz*.9)+ph;tx+=Math.cos(a)*r;ty+=Math.sin(a)*r;}
      else if(flow==='melt'){var m=(T*.11+ph/6.2832)%1;ty+=(.5-.5*Math.cos(m*6.2832))*ih*.14*(1.1-hz*.6);}
      else if(flow==='travel'){var kk=(T*.09+hz*.6+ph*.02)%1,sc=.72+kk*.7;tx=cx+(hx-cx)*sc;ty=cy+(hy-cy)*sc;}
      else{tx+=Math.sin(T*.6+ph)*amp*.5;ty+=Math.cos(T*.5+ph*1.3)*amp*.5;}
      project((tx-cx)*spr,(ty-cy)*spr,(hz-.5)*zAmpT+Math.sin(T*.5+ph)*amp*.6);
      var X=PX, Y=PY, wi=TK.w[i]; TK.ps[i]=PS;
      /* suivi : chaque traqueur se déplace avec le pointeur selon son propre poids, puis converge vers lui de près */
      X+=(mouse.ptx-mcx)*wi*.55;Y+=(mouse.pty-mcy)*wi*.55;
      var gx=mouse.ptx-X, gy=mouse.pty-Y, gd=Math.sqrt(gx*gx+gy*gy);
      if(gd<R){var f=1-gd/R;f=f*f*(.3+.6*wi);X+=gx*f;Y+=gy*f;}
      if(S.trkFl<.5){var nj=(.5-S.trkFl)*2*3;X+=(Math.random()-.5)*nj;Y+=(Math.random()-.5)*nj;}
      var kq=TK.k[i]*kmul;
      TK.vx[i]+=(X-TK.x[i])*kq;TK.vy[i]+=(Y-TK.y[i])*kq;
      TK.vx[i]*=damp;TK.vy[i]*=damp;
      TK.x[i]+=TK.vx[i];TK.y[i]+=TK.vy[i];
    }
  }
  /* éclabousser : onde de choc à partir d'un point de l'écran */
  function splash(x,y,k){
    var R=Math.max(220,Math.min(W,H)*.45);
    for(var i=0;i<P.n;i++){
      var dx=P.x[i]-x,dy=P.y[i]-y,d=Math.sqrt(dx*dx+dy*dy)+.001;
      if(d<R){var f=(1-d/R);f*=f;var q=f*(26+P.hz[i]*30)*k;P.vx[i]+=dx/d*q;P.vy[i]+=dy/d*q;}
    }
  }
   
  /* ---------- couleurs ---------- */
  var buckets=[];
  function inkRGB(){
    var f=fgRGB();
    if(!S.lightOn)return f;
    var t=S.tint;
    return isLight()?[t[0]*.4|0,t[1]*.4|0,t[2]*.4|0]:t;
  }
  function makeBuckets(){
    var f=inkRGB();buckets=[];
    var bgc=isLight()?[243,243,241]:[5,5,6];
    for(var i=0;i<6;i++){
      var a=.25+i*.15;buckets.push('rgba('+f[0]+','+f[1]+','+f[2]+','+a.toFixed(2)+')');
      bucketU32[i]=pack(Math.round(f[0]*a+bgc[0]*(1-a)),Math.round(f[1]*a+bgc[1]*(1-a)),Math.round(f[2]*a+bgc[2]*(1-a)));
    }
  }
  function hsl2rgb(h,s,l){
    var a=s*Math.min(l,1-l);
    function f(n){var k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))))}
    return [f(0),f(8),f(4)];
  }
   
  /* ---------- tampon de pixels ---------- */
  function fbClear(){
    if(!FB.u32)return;
    var l=isLight();
    if(S.trails){
      var d=FB.data,n=d.length,r0=l?243:5,g0=l?243:5,b0=l?241:6;
      for(var j=0;j<n;j+=4){d[j]+=((r0-d[j])*34)>>8;d[j+1]+=((g0-d[j+1])*34)>>8;d[j+2]+=((b0-d[j+2])*34)>>8;}
    }else FB.u32.fill(l?BG_L:BG_D);
  }
  function plot(x,y,sz,col,a){
    var fw=FB.w,fh=FB.h,fu=FB.u32,sp;
    if(sz<1){a*=.55+.45*sz;sp=1;}else sp=(sz+.5)|0;
    if(a<.03)return;
    var x0=Math.round(x-sp*.5),y0=Math.round(y-sp*.5);
    if(x0>=fw||y0>=fh||x0+sp<=0||y0+sp<=0)return;
    var xa=x0<0?0:x0,ya=y0<0?0:y0,xb=x0+sp>fw?fw:x0+sp,yb=y0+sp>fh?fh:y0+sp,xx,yy,idx;
    if(a>=.97){
      for(yy=ya;yy<yb;yy++){idx=yy*fw+xa;for(xx=xa;xx<xb;xx++)fu[idx++]=col;}
    }else{
      var ia=(a*256)|0,ra=256-ia,sr=col&255,sg=(col>>>8)&255,sb=(col>>>16)&255;
      for(yy=ya;yy<yb;yy++){
        idx=yy*fw+xa;
        for(xx=xa;xx<xb;xx++){
          var dd=fu[idx];
          fu[idx++]=(0xFF000000|((((dd>>>16)&255)*ra+sb*ia)>>8)<<16|((((dd>>>8)&255)*ra+sg*ia)>>8)<<8|(((dd&255)*ra+sr*ia)>>8))>>>0;
        }
      }
    }
  }
  function streak(x0,y0,x1,y1,col){
    var dx=x1-x0,dy=y1-y0,n=Math.min(36,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
    for(var k=0;k<=n;k++){var t=k/(n||1);plot(x0+dx*t,y0+dy*t,1,col,.1+.4*t);}
  }
  function hexRGB(h){var v=parseInt(h.slice(1),16);return [(v>>16)&255,(v>>8)&255,v&255]}
  function hexOf(c){return '#'+c.map(function(v){return (v<16?'0':'')+v.toString(16)}).join('')}
  function syncSwatches(){
    var f=hexOf(fgRGB());
    if(!S.trkCol&&$('#trkCol'))$('#trkCol').value=f;
    if(!S.linkCol&&$('#linkCol'))$('#linkCol').value=f;
  }
   
  /* ---------- boucle ---------- */
  function frame(now){
    var rawMs=now-last;
    var dt=Math.min(.05,(now-last)/1000);last=now;T+=dt;frameNo++;
    var im=images[cur];
    if(!cam.drag){cam.yaw+=cam.vy;cam.pitch=clamp(cam.pitch+cam.vp,-1.25,1.25);cam.vy*=.94;cam.vp*=.94;}
    var idle=now-mouse.last>3000;
    if(idle){mouse.tx=Math.sin(T*.35)*.7;mouse.ty=Math.cos(T*.27)*.5;mouse.ptx=W/2+Math.sin(T*.5)*W*.2;mouse.pty=H*.4+Math.cos(T*.37)*H*.15;}
    mouse.x+=(mouse.tx-mouse.x)*.06;mouse.y+=(mouse.ty-mouse.y)*.06;
    mouse.px+=(mouse.ptx-mouse.px)*.12;mouse.py+=(mouse.pty-mouse.py)*.12;
    if(S.hue&&S.lightOn&&frameNo%6===0){S.tint=hsl2rgb((T*20)%360,.7,.72);makeBuckets();}
   
    fbClear();
   
    if(im&&P.n){
      var rc=stageRect(), s=rc.s, ox=rc.ox, oy=rc.oy;
      var cx=im.w/2, cy=im.h/2, amp=im.w*.014, ih=im.h;
      var flow=S.flow, q=S.fDrift*.6, zAmp=im.w*S.fDepth*1.5, useCol=S.trueCol;
      /* dérive : une part des particules s'échappe vers l'extérieur, puis s'efface et renaît à sa place */
      var escF=Math.min(1,S.fDrift*1.9), escR=im.w*(.3+S.fDrift*.9);
      var axx=Math.cos(S.axA), axy=Math.sin(S.axA), axb=S.axB;
      /* hémisphère : seule la moitié de l'image située du côté de l'axe se dissout, de plus en plus vers le bord */
      var hemi=axb>.05, invExt=1/Math.max(1,Math.abs(axx)*im.w/2+Math.abs(axy)*im.h/2);
      var sz0=S.size*(s>1?Math.min(1.4,s):1);
      var scanY=oy+((T*.2)%1.15)*im.h*s, band=Math.max(16,im.h*s*.05);
      var gR=Math.max(160,Math.min(W,H)*.3)*(.5+S.fGather), gK=S.fGather*1.6, trailsOn=S.trails;
      var hotU=isLight()?0xFF000000:0xFFFFFFFF, dpr=DPR, bu=bucketU32;
      setCam(im,rc);
      var rs=buildRepSources(now), nrs=rs.length/3, rK=5*S.rep, rR=S.repR, retMul=.15*Math.pow(20,S.retSpd), retDens=S.retDens;
   
      if(S.fSplash>0&&T>nextSplash){
        nextSplash=T+(8-5*S.fSplash)+Math.random()*3;
        if(idle) splash(ox+Math.random()*im.w*s,oy+Math.random()*im.h*s,.5+S.fSplash*1.3);
      }
      var streakMax=Math.min(P.n,24000);
   
      for(var i=0;i<P.n;i++){
        var hx=P.hx[i],hy=P.hy[i],hz=P.hz[i],ph=P.ph[i],tx=hx,ty=hy;
        if(flow==='swarm'){var r=amp*2.4*(1.15-hz),a=T*(.35+hz*.9)+ph;tx+=Math.cos(a)*r;ty+=Math.sin(a)*r;}
        else if(flow==='melt'){var m=(T*.11+ph/6.2832)%1;ty+=(.5-.5*Math.cos(m*6.2832))*ih*.14*(1.1-hz*.6);tx+=Math.sin(T*.4+ph)*amp*.4;}
        else if(flow==='travel'){var kk=(T*.09+hz*.6+ph*.02)%1,sc=.72+kk*.7;tx=cx+(hx-cx)*sc;ty=cy+(hy-cy)*sc;}
        tx+=Math.sin(T*.6+ph)*amp*(.3+hz)*q;ty+=Math.cos(T*.5+ph*1.3)*amp*(.3+hz)*q;
        var tz=(hz-.5)*zAmp+Math.sin(T*.4+ph)*amp*.8*q;
        project(tx-cx,ty-cy,tz);
        var X=PX, Y=PY, pS=PS;
        if(gK>0){
          var gx=mouse.px-X,gy=mouse.py-Y,gd=Math.sqrt(gx*gx+gy*gy);
          if(gd<gR){var gf=1-gd/gR;gf=Math.min(.9,gf*gf*(.2+.7*hz)*gK);X+=gx*gf;Y+=gy*gf;}
        }
        var ddx=X-P.x[i], ddy=Y-P.y[i], kk=.07;
        if(P.hit[i]>0){
          P.hit[i]-=dt*.125;
          if(ddx*ddx+ddy*ddy<36||P.hit[i]<=0)P.hit[i]=0;
          else kk=.07*retMul*(P.rk[i]<retDens?1:.1);
        }
        P.vx[i]+=ddx*kk;P.vy[i]+=ddy*kk;
        P.vx[i]*=.8;P.vy[i]*=.8;
        if(nrs){
          for(var rj=0;rj<nrs;rj++){
            var qx=P.x[i]-rs[rj*3], qy=P.y[i]-rs[rj*3+1], q2=qx*qx+qy*qy, rr=rR*rs[rj*3+2];
            if(q2<rr*rr&&q2>.01){
              var qd=Math.sqrt(q2), qf=1-qd/rr;qf*=qf*rK*rs[rj*3+2]*(.5+P.hz[i]*.9);
              P.vx[i]+=qx/qd*qf;P.vy[i]+=qy/qd*qf;P.hit[i]=1;
            }
          }
        }
        P.x[i]+=P.vx[i];P.y[i]+=P.vy[i];
        var px=P.x[i],py=P.y[i],al=1;
        var gate=1;
        if(hemi){
          gate=((hx-cx)*axx+(hy-cy)*axy)*invExt;
          gate=gate<-.04?0:Math.pow(Math.min(1,(gate+.04)/1.04),.8);
        }
        if(P.th[i]<escF*gate){
          var u=(T*P.rt[i]+ph*.15915)%1;
          var dd=Math.pow(u,1.7)*escR*P.rd[i]*s*pS*(1+axb*.8)*(hemi?.35+.65*gate:1);
          var ex=hx-cx, ey=hy-cy, el=Math.sqrt(ex*ex+ey*ey)+1;
          var rx=Math.cos(ph), ry=Math.sin(ph), dtp=rx*axx+ry*axy;
          var oxn=rx*.55+ex/el*.7, oyn=ry*.55+ey/el*.7;
          if(dtp<0){rx-=2*dtp*axx;ry-=2*dtp*axy;}
          var dxn=oxn*(1-axb)+(axx*.9+rx*.45)*axb, dyn=oyn*(1-axb)+(axy*.9+ry*.45)*axb;
          var sw=Math.sin(T*.8+ph*3)*dd*.12;
          px+=dxn*dd-dyn*sw;py+=dyn*dd+dxn*sw;
          al=1-u;al*=al;
        }
        var sz=sz0*(.55+hz*.95)*pS*(al<1?(.45+.55*al):1), hot=false;
        if(S.scan&&Math.abs(py-scanY)<band){hot=true;sz*=1.9;}
        var pc=hot?hotU:(useCol?P.cu[i]:bu[(hz*5.99)|0]);
        plot(px*dpr,py*dpr,sz*dpr,pc,al);
        if(trailsOn&&i<streakMax){
          var vx0=P.vx[i],vy0=P.vy[i],sl=Math.sqrt(vx0*vx0+vy0*vy0);
          if(sl>.35){var sk=Math.min(7,36/sl);streak((px-vx0*sk)*dpr,(py-vy0*sk)*dpr,px*dpr,py*dpr,pc);}
        }
      }
      ctx.putImageData(FB.img,0,0);
      if(S.scan){
        var f=fgRGB();ctx.fillStyle='rgba('+f[0]+','+f[1]+','+f[2]+',.35)';
        ctx.fillRect(ox,scanY,im.w*s,1);
      }
      if(S.links||S.track||S.marks){updateTrackers(im,rc);drawTrackers(im,rc);}
      drawHUD(im,rc);
      if(rawMs<250)ftAvg=ftAvg*.92+rawMs*.08;
      if(frameNo>tuneAfter&&frameNo%60===0&&ftAvg>48&&S.density>30000){
        S.density=Math.max(30000,Math.round(S.density*.7/1000)*1000);
        $('#density').value=S.density;ftAvg=16;tuneAfter=frameNo+150;
        build(false);setStatus('Densité réduite à '+S.density.toLocaleString('fr-FR')+' pour garder la fluidité');
      }
    }
    requestAnimationFrame(frame);
  }
  /* sillage de souris : points de répulsion (pointeur + traînée) */
  function buildRepSources(now){
    var out=[];
    while(trail.length&&now-trail[0].t>1100)trail.shift();
    if(!S.mtrail||S.rep<=0)return out;
    if(cam.drag&&mouse.ptype==='mouse')return out;
    if(mouse.rin&&now-mouse.last<4000)out.push(mouse.rx,mouse.ry,1);
    for(var k=trail.length-1,c=0;k>=0&&c<7;k-=5,c++){
      var a=1-(now-trail[k].t)/1100;
      if(a>.05)out.push(trail[k].x,trail[k].y,a*.8);
    }
    return out;
  }
  function sgn(v){return (v<0?'-':'+')+Math.abs(v).toFixed(2)}
  function pad2(n){return n<10?'0'+n:''+n}
  function drawTrackers(im,rc){
    var L=Math.min(TK.n,S.trackers), f=fgRGB();
    var rgb=(S.trkCol?hexRGB(S.trkCol):f).join(','), lrgb=(S.linkCol?hexRGB(S.linkCol):f).join(',');
    var lw=Math.max(.3,S.line), tz=S.trkSz;
    if(S.links){
      var D=Math.sqrt(rc.s*rc.s*im.w*im.h/Math.max(L,1))*1.9*Math.max(.6,S.trkSpr), inv=1/D, cols=Math.ceil(W*inv)+2, grid=new Map(), i;
      for(i=0;i<L;i++){
        var key=((TK.y[i]*inv)|0)*cols+((TK.x[i]*inv)|0);
        var arr=grid.get(key); if(arr)arr.push(i); else grid.set(key,[i]);
      }
      ctx.lineWidth=lw;ctx.strokeStyle='rgba('+lrgb+','+(S.linkCol?'.6':'.32')+')';
      ctx.beginPath();var count=0;
      for(var j=0;j<L&&count<5000;j++){
        var cx=(TK.x[j]*inv)|0, cy=(TK.y[j]*inv)|0;
        for(var oy=-1;oy<=1;oy++)for(var ox=-1;ox<=1;ox++){
          var a=grid.get((cy+oy)*cols+(cx+ox)); if(!a)continue;
          for(var q=0;q<a.length;q++){
            var k=a[q]; if(k<=j)continue;
            var dx=TK.x[k]-TK.x[j],dy=TK.y[k]-TK.y[j];
            if(dx*dx+dy*dy<D*D){ctx.moveTo(TK.x[j],TK.y[j]);ctx.lineTo(TK.x[k],TK.y[k]);count++;}
          }
        }
      }
      ctx.stroke();
    }
    if(S.track||S.marks){
      ctx.lineWidth=lw;ctx.strokeStyle='rgba('+rgb+',.8)';ctx.fillStyle='rgba('+rgb+',.7)';
      ctx.font=Math.round(clamp(8*tz,6,22))+'px Manrope, sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';
      ctx.beginPath();
      for(var t=0;t<L;t++){
        var x=TK.x[t],y=TK.y[t],h=(4+TK.hz[t]*8)*TK.ps[t]*tz;
        if(S.track){
          var c=h*.6;
          ctx.moveTo(x-h,y-h+c);ctx.lineTo(x-h,y-h);ctx.lineTo(x-h+c,y-h);
          ctx.moveTo(x+h-c,y-h);ctx.lineTo(x+h,y-h);ctx.lineTo(x+h,y-h+c);
          ctx.moveTo(x+h,y+h-c);ctx.lineTo(x+h,y+h);ctx.lineTo(x+h-c,y+h);
          ctx.moveTo(x-h+c,y+h);ctx.lineTo(x-h,y+h);ctx.lineTo(x-h,y+h-c);
          ctx.moveTo(x-1.5*tz,y);ctx.lineTo(x+1.5*tz,y);ctx.moveTo(x,y-1.5*tz);ctx.lineTo(x,y+1.5*tz);
        }
        if(S.marks){var mk=2.5*tz;ctx.moveTo(x-mk,y);ctx.lineTo(x+mk,y);ctx.moveTo(x,y-mk);ctx.lineTo(x,y+mk);}
      }
      ctx.stroke();
      if(S.track){
        var step=Math.max(1,Math.round(L/16));
        try{ctx.letterSpacing='1px'}catch(e){}
        for(var u=0;u<L;u+=step){
          var nx=(TK.hx[u]-im.w/2)/(im.w/2), ny=-(TK.hy[u]-im.h/2)/(im.h/2), nz=TK.hz[u]-.5;
          ctx.fillText(pad2(u+1)+' '+sgn(nx)+' '+sgn(ny)+' '+sgn(nz),TK.x[u]+(TK.hz[u]*8*TK.ps[u]+7)*tz,TK.y[u]-TK.hz[u]*8*TK.ps[u]*tz+3);
        }
        try{ctx.letterSpacing='0px'}catch(e){}
      }
    }
  }
  /* cadre gradué autour de la scène */
  function drawHUD(im,rc){
    if(!S.hud)return;
    var pad=28, x0=rc.ox-pad, y0=rc.oy-pad, x1=rc.ox+im.w*rc.s+pad, y1=rc.oy+im.h*rc.s+pad;
    var f=fgRGB(), rgb=f[0]+','+f[1]+','+f[2];
    ctx.lineWidth=1;ctx.strokeStyle='rgba('+rgb+',.3)';ctx.fillStyle='rgba('+rgb+',.42)';
    ctx.beginPath();
    [[x0,y0],[x1,y0],[x0,y1],[x1,y1]].forEach(function(c){
      ctx.moveTo(c[0]-10,c[1]+.5);ctx.lineTo(c[0]+10,c[1]+.5);ctx.moveTo(c[0]+.5,c[1]-10);ctx.lineTo(c[0]+.5,c[1]+10);
    });
    var step=9,i,x,y;
    for(x=x0+step,i=1;x<x1-4;x+=step,i++){var Lh=i%5===0?9:4;ctx.moveTo(x+.5,y0);ctx.lineTo(x+.5,y0+Lh);ctx.moveTo(x+.5,y1);ctx.lineTo(x+.5,y1-Lh);}
    for(y=y0+step,i=1;y<y1-4;y+=step,i++){var Lv=i%5===0?9:4;ctx.moveTo(x0,y+.5);ctx.lineTo(x0+Lv,y+.5);ctx.moveTo(x1,y+.5);ctx.lineTo(x1-Lv,y+.5);}
    ctx.stroke();
    ctx.font='9px Manrope, sans-serif';ctx.textBaseline='alphabetic';
    try{ctx.letterSpacing='2px'}catch(e){}
    ctx.textAlign='left';
    ctx.fillText(pad2(cur+1)+' / '+pad2(images.length)+'  '+images[cur].name.toUpperCase(),x0+14,y0-10);
    ctx.fillText(P.n.toLocaleString('fr-FR')+' PTS',x0+14,y1+20);
    ctx.textAlign='right';
    ctx.fillText(FORCES[S.last].toUpperCase()+' '+Math.round(S[S.last]*100),x1-14,y0-10);
    ctx.textAlign='left';
    try{ctx.letterSpacing='0px'}catch(e){}
  }
   
  /* ---------- informations et miniatures ---------- */
  function updateInfo(){
    $('#title').textContent=FORCES[S.last];
    var im=images[cur];
    $('#l1').textContent='Modèle de profondeur · '+((S.ai&&im&&im.ai)?'Depth Anything V2 Small':'luminosité');
    $('#l2').textContent=P.n.toLocaleString('fr-FR')+' points';
  }
  function setStatus(t){
    var e=$('#status');e.textContent=t;e.style.opacity=t?1:0;
    clearTimeout(setStatus.t);if(t)setStatus.t=setTimeout(function(){e.style.opacity=0},3200);
  }
  function buildThumbs(){
    var box=$('#thumbs');box.innerHTML='';
    images.forEach(function(im,i){
      var b=document.createElement('button');b.className='th'+(i===cur?' on':'');b.setAttribute('aria-label','Image '+(i+1)+' : '+im.name);
      var c=document.createElement('canvas');c.width=84;c.height=84;
      var g=c.getContext('2d'), sc=Math.max(84/im.w,84/im.h), w=im.w*sc, h=im.h*sc;
      g.drawImage(im.src,(84-w)/2,(84-h)/2,w,h);
      b.appendChild(c);
      var n=document.createElement('i');n.textContent=i+1;b.appendChild(n);
      b.addEventListener('click',function(){show(i,true)});
      box.appendChild(b);
    });
    if(images.length<4){
      var a=document.createElement('button');a.className='th add';a.textContent='+';a.setAttribute('aria-label','Ajouter des images');
      a.addEventListener('click',function(){$('#file').click()});
      box.appendChild(a);
    }
  }
  function show(i,scatter){
    if(!images.length)return;
    cur=((i%images.length)+images.length)%images.length;
    build(scatter);
    var ts=$('#thumbs').children;
    for(var k=0;k<ts.length;k++)ts[k].classList.toggle('on',k===cur);
  }
  function loadFiles(files){
    var list=Array.prototype.filter.call(files,function(f){return /^image\//.test(f.type)}).slice(0,4);
    if(!list.length)return;
    setStatus('Chargement…');
    Promise.all(list.map(function(f){
      var url=URL.createObjectURL(f);
      return toImage(url,f.name.replace(/\.[^.]+$/,'')).then(function(r){var a=analyse(r.img,r.name);URL.revokeObjectURL(url);return a;});
    })).then(function(arr){
      images=arr;cur=0;$('#hint').classList.remove('on');
      var ph=autoPhoto(arr[0]);
      buildThumbs();
      if(S.ai)runAI();
      show(0,true);setStatus(ph?'Photo détectée : couleurs réelles activées':'');
    }).catch(function(){setStatus('Image illisible, essaie un autre fichier')});
  }
   
  /* ---------- profondeur IA (optionnelle) ---------- */
  var depthPipe=null, aiBusy=false;
  async function runAI(){
    if(aiBusy)return; aiBusy=true;
    try{
      if(!depthPipe){
        setStatus('Chargement du modèle de profondeur…');
        var mod=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
        depthPipe=await mod.pipeline('depth-estimation','onnx-community/depth-anything-v2-small');
      }
      for(var n=0;n<images.length;n++){
        var im=images[n]; if(im.ai)continue;
        setStatus('Profondeur '+(n+1)+' / '+images.length+'…');
        var out=await depthPipe(im.src.toDataURL('image/png'));
        var d=out.depth, dd=new Float32Array(im.w*im.h);
        for(var y=0;y<im.h;y++)for(var x=0;x<im.w;x++){
          var sx=Math.min(d.width-1,(x/im.w*d.width)|0), sy=Math.min(d.height-1,(y/im.h*d.height)|0);
          dd[y*im.w+x]=d.data[(sy*d.width+sx)*(d.channels||1)];
        }
        im.aiRaw=dd;computeMask(im);
      }
      build(false);setStatus('');
    }catch(e){
      S.ai=false;$('#ai').setAttribute('aria-pressed','false');
      setStatus('Modèle indisponible, la luminosité sert de profondeur');updateInfo();
    }
    aiBusy=false;
  }
   
  /* ---------- interface ---------- */
  function tog(id,key,fn){
    $(id).addEventListener('click',function(){
      S[key]=!S[key];this.setAttribute('aria-pressed',S[key]);fn&&fn();
    });
  }
  ['track','links','scan','trails','marks'].forEach(function(k){tog('#'+k,k)});
  tog('#hud','hud');
  tog('#white','onWhite',function(){applyTheme();build(false)});
  tog('#neg','neg',function(){applyTheme();build(false)});
  tog('#true','trueCol',function(){build(false)});
  tog('#ai','ai',function(){if(S.ai&&images.some(function(i){return !i.ai}))runAI();else{images.forEach(computeMask);build(false)}});
  function setLight(on){S.lightOn=on;$('#light').setAttribute('aria-pressed',on);makeBuckets()}
  $('#light').addEventListener('click',function(){setLight(!S.lightOn)});
   
  Object.keys(FORCES).forEach(function(id){
    $('#'+id).addEventListener('input',function(){S[id]=this.value/100;S.last=id;updateInfo()});
  });
  var flowRow=$('#g-flow');
  flowRow.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    var off=b.classList.contains('on');
    Array.prototype.forEach.call(flowRow.children,function(c){c.classList.remove('on')});
    if(!off)b.classList.add('on');
    S.flow=off?'':b.dataset.v;
  });
  /* palette de lumière */
  var COLORS=[[255,233,200],[205,215,255],[255,170,60],[255,70,60],[40,220,190],[150,110,255]];
  (function(){
    var box=$('#dots');
    COLORS.forEach(function(c,i){
      var b=document.createElement('button');b.className='dot'+(i===0?' on':'');
      b.style.background='rgb('+c.join(',')+')';b.setAttribute('aria-label','Couleur de lumière '+(i+1));
      b.addEventListener('click',function(){pickDot(b,c,false)});
      box.appendChild(b);
    });
    var a=document.createElement('button');a.className='dot auto';a.setAttribute('aria-label','Lumière changeante');a.title='Couleur changeante';
    a.addEventListener('click',function(){pickDot(a,null,true)});
    box.appendChild(a);
  })();
  function pickDot(btn,c,hue){
    Array.prototype.forEach.call($('#dots').children,function(d){d.classList.remove('on')});
    btn.classList.add('on');
    S.hue=hue;if(c)S.tint=c;
    setLight(true);
  }
  var recutBusy=false;
  function recut(){
    if(recutBusy)return;recutBusy=true;
    requestAnimationFrame(function(){recutBusy=false;images.forEach(computeMask);build(false);});
  }
  $('#cut').addEventListener('click',function(){S.cut=!S.cut;this.setAttribute('aria-pressed',S.cut);recut()});
  $('#cutT').addEventListener('input',function(){
    S.cutT=this.value/100;
    if(!S.cut){S.cut=true;$('#cut').setAttribute('aria-pressed','true');}
    recut();
  });
  tog('#mtrail','mtrail');
  $('#trkCol').addEventListener('input',function(){S.trkCol=this.value;ensureTrk()});
  $('#linkCol').addEventListener('input',function(){S.linkCol=this.value;if(!S.links){S.links=true;$('#links').setAttribute('aria-pressed','true');ensureTrk()}});
  $('#colAuto').addEventListener('click',function(){S.trkCol=null;S.linkCol=null;syncSwatches()});
  $('#trkFl').addEventListener('input',function(){S.trkFl=this.value/100});
  $('#trkSpr').addEventListener('input',function(){S.trkSpr=this.value/100;$('#trkSprv').textContent=this.value+' %';ensureTrk()});
  $('#trkSz').addEventListener('input',function(){S.trkSz=this.value/100;$('#trkSzv').textContent=this.value+' %';ensureTrk()});
  function wake(){if(!S.mtrail){S.mtrail=true;$('#mtrail').setAttribute('aria-pressed','true');}}
  function readouts(){
    $('#repRv').textContent=Math.round(S.repR)+' px';
    $('#repv').textContent=Math.round(S.rep*100)+' %';
    $('#retSv').textContent='×'+(.15*Math.pow(20,S.retSpd)).toFixed(1);
    $('#retDv').textContent=Math.round(S.retDens*100)+' %';
  }
  $('#rep').addEventListener('input',function(){S.rep=this.value/100;wake();readouts()});
  $('#repR').addEventListener('input',function(){S.repR=+this.value;wake();readouts()});
  $('#retS').addEventListener('input',function(){S.retSpd=this.value/100;wake();readouts()});
  $('#retD').addEventListener('input',function(){S.retDens=this.value/100;wake();readouts()});
  readouts();
  /* axe de dissipation */
  function drawAxis(){
    var c=$('#axc'),g=c.getContext('2d'),w=c.width,h=c.height,f=fgRGB(),rgb=f[0]+','+f[1]+','+f[2];
    g.clearRect(0,0,w,h);
    var cx=w/2,cy=h/2,half=w/2,dx=Math.cos(S.axA),dy=Math.sin(S.axA),nx=-dy,ny=dx;
    g.lineWidth=2;g.strokeStyle='rgba('+rgb+',.75)';g.fillStyle='rgba('+rgb+',.85)';
    var ex=nx*half*.78,ey=ny*half*.78;
    g.beginPath();g.moveTo(cx-ex,cy-ey);g.lineTo(cx+ex,cy+ey);g.stroke();
    [[-1],[1]].forEach(function(k){g.beginPath();g.arc(cx+ex*k[0],cy+ey*k[0],5,0,6.2832);g.fillStyle=isLight()?'#f3f3f1':'#050506';g.fill();g.stroke();});
    var dist=S.axL*half*.92;
    g.beginPath();g.arc(cx+dx*dist,cy+dy*dist,4.5,0,6.2832);g.fillStyle='rgba('+rgb+',.95)';g.fill();
  }
  function setAxis(a,b,l){S.axA=a;S.axB=clamp(b,0,1);S.axL=l!==undefined?l:(S.axB>0?.12+.78*S.axB:0);drawAxis()}
  function axisFrom(e){
    var r=$('#axis').getBoundingClientRect(),vx=(e.clientX-r.left-r.width/2)/(r.width/2),vy=(e.clientY-r.top-r.height/2)/(r.height/2);
    var l=Math.min(1,Math.hypot(vx,vy));
    setAxis(l<.06?S.axA:Math.atan2(vy,vx),l<.12?0:(l-.12)/.78,l<.12?0:l);
  }
  var axDrag=false;
  $('#axis').addEventListener('pointerdown',function(e){axDrag=true;try{this.setPointerCapture(e.pointerId)}catch(_){}axisFrom(e)});
  $('#axis').addEventListener('pointermove',function(e){if(axDrag)axisFrom(e)});
  $('#axis').addEventListener('pointerup',function(){axDrag=false});
  $('#axis').addEventListener('pointercancel',function(){axDrag=false});
  $('#axis').addEventListener('dblclick',function(){setAxis(-.25,.65)});
  $('#axis').addEventListener('keydown',function(e){
    var k=e.key;
    if(k==='ArrowLeft')setAxis(S.axA-.2,S.axB);
    else if(k==='ArrowRight')setAxis(S.axA+.2,S.axB);
    else if(k==='ArrowUp')setAxis(S.axA,S.axB+.1);
    else if(k==='ArrowDown')setAxis(S.axA,S.axB-.1);
    else return;
    e.preventDefault();
  });
  $('#density').addEventListener('input',function(){S.density=+this.value;build(false)});
  $('#size').addEventListener('input',function(){S.size=this.value/10});
  function syncTrk(){
    var v=S.trackers;
    $('#sparse').classList.toggle('on',v===120);$('#dense').classList.toggle('on',v===650);
  }
  function ensureTrk(){
    if(!S.track&&!S.links&&!S.marks){S.track=true;$('#track').setAttribute('aria-pressed','true');}
  }
  function setTrackers(v,write){
    v=Math.round(v);if(!isFinite(v))return;
    S.trackers=clamp(v,0,5000);
    if(write)$('#trackers').value=S.trackers;
    if(S.trackers>0)ensureTrk();
    syncTrk();
  }
  $('#trackers').addEventListener('input',function(){if(this.value!=='')setTrackers(+this.value,false)});
  $('#trackers').addEventListener('change',function(){setTrackers(+this.value||0,true)});
  $('#trackers').addEventListener('keydown',function(e){e.stopPropagation()});
  $('#sparse').addEventListener('click',function(){setTrackers(120,true)});
  $('#dense').addEventListener('click',function(){setTrackers(650,true)});
  $('#line').addEventListener('input',function(){S.line=this.value/10});
  $('#next').addEventListener('click',function(){show(cur+1,true)});
  $('#reset').addEventListener('click',resetCam);
  $('#file').addEventListener('change',function(){loadFiles(this.files);this.value=''});
  $('#credBtn').addEventListener('click',function(){$('#credits').classList.toggle('on')});
  function toggleUI(){$('#ui').classList.toggle('off');setTimeout(function(){build(false)},0)}
  $('#hide').addEventListener('click',toggleUI);
  function fullscreen(){
    try{
      if(document.fullscreenElement)document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }catch(e){}
  }
  $('#fs').addEventListener('click',fullscreen);
   
  /* pointeur : rotation 3D, zoom, clic = éclaboussure */
  var ptrs=new Map(), pinch0=0;
  cv.style.touchAction='none';
  cv.addEventListener('pointerdown',function(e){
    try{cv.setPointerCapture(e.pointerId)}catch(_){}
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),moved:0});
    mouse.ptype=e.pointerType||'mouse';mouse.rx=e.clientX;mouse.ry=e.clientY;mouse.rin=true;
    cam.drag=true;cam.vy=0;cam.vp=0;
    mouse.ptx=e.clientX;mouse.pty=e.clientY;mouse.last=performance.now();
    if(ptrs.size===2){var a=Array.from(ptrs.values());pinch0=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
  });
  addEventListener('pointermove',function(e){
    var p=ptrs.get(e.pointerId);
    if(!p&&e.target.closest&&e.target.closest('#bottom,#thumbs,.tr')){mouse.rin=false;return;}
    mouse.ptx=e.clientX;mouse.pty=e.clientY;mouse.last=performance.now();
    mouse.rx=e.clientX;mouse.ry=e.clientY;mouse.rin=true;mouse.ptype=e.pointerType||'mouse';
    trail.push({x:e.clientX,y:e.clientY,t:mouse.last});if(trail.length>60)trail.shift();
    if(p){
      var dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX;p.y=e.clientY;p.moved+=Math.abs(dx)+Math.abs(dy);
      if(ptrs.size>=2){
        var a=Array.from(ptrs.values()), d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
        if(pinch0>0)cam.zoom=clamp(cam.zoom*d/pinch0,.45,3.2);
        pinch0=d;
      }else{
        cam.yaw+=dx*.006;cam.pitch=clamp(cam.pitch-dy*.006,-1.25,1.25);
        cam.vy=dx*.0016;cam.vp=-dy*.0016;
      }
    }else{mouse.tx=(e.clientX/W-.5)*2;mouse.ty=(e.clientY/H-.5)*2;}
  });
  function endPtr(e){
    var p=ptrs.get(e.pointerId);
    if(p&&ptrs.size===1&&p.moved<6&&performance.now()-p.t<350&&S.fSplash>0)splash(e.clientX,e.clientY,.6+S.fSplash*1.4);
    ptrs.delete(e.pointerId);if(!ptrs.size)cam.drag=false;pinch0=0;
  }
  document.documentElement.addEventListener('mouseleave',function(){mouse.rin=false});
  cv.addEventListener('pointerup',endPtr);
  cv.addEventListener('pointercancel',endPtr);
  cv.addEventListener('wheel',function(e){e.preventDefault();cam.zoom=clamp(cam.zoom*Math.exp(-e.deltaY*.0012),.45,3.2)},{passive:false});
  cv.addEventListener('dblclick',resetCam);
   
  addEventListener('keydown',function(e){
    if(/input|textarea/i.test(e.target.tagName))return;
    if(e.code==='Space'){e.preventDefault();show(cur+1,true);}
    else if(e.key==='s'||e.key==='S')setLight(!S.lightOn);
    else if(e.key==='p'||e.key==='P')savePNG();
    else if(e.key==='h'||e.key==='H')toggleUI();
    else if(e.key==='f'||e.key==='F')fullscreen();
  });
  addEventListener('dragover',function(e){e.preventDefault();$('#drop').classList.add('on')});
  addEventListener('dragleave',function(e){if(!e.relatedTarget)$('#drop').classList.remove('on')});
  addEventListener('drop',function(e){e.preventDefault();$('#drop').classList.remove('on');loadFiles(e.dataTransfer.files)});
  addEventListener('paste',function(e){if(e.clipboardData&&e.clipboardData.files.length)loadFiles(e.clipboardData.files)});
  addEventListener('resize',function(){resize();build(false)});
   
  /* ---------- export ---------- */
  function download(blob,name){
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},4000);
  }
  function savePNG(){cv.toBlob(function(b){if(b)download(b,'nuee-'+Date.now()+'.png')},'image/png')}
  $('#png').addEventListener('click',savePNG);
  /* ---------- export pour nuee-embed.js ---------- */
  var EXPORT_KEYS=['fDrift','fSplash','fGather','fDepth','flow','track','links','scan','trails','marks','onWhite','neg','trueCol','lightOn','tint','hue','ai','density','size','trackers','line','cut','cutT','axA','axB','axL','trkFl','trkSz','trkSpr','mtrail','rep','repR','retSpd','retDens','trkCol','linkCol'];
  function buildScene(){
    var im=images[cur],st={};
    EXPORT_KEYS.forEach(function(k){st[k]=S[k]});
    st.ai=!!(S.ai&&im.aiRaw);
    var scene={version:1,name:im.name,image:im.alpha?im.src.toDataURL('image/png'):im.src.toDataURL('image/jpeg',.9),settings:st};
    if(st.ai){
      var d=stretch(im.aiRaw),c=document.createElement('canvas');c.width=im.w;c.height=im.h;
      var g=c.getContext('2d'),id=g.createImageData(im.w,im.h);
      for(var i=0;i<d.length;i++){var v=Math.round(d[i]*255);id.data[i*4]=v;id.data[i*4+1]=v;id.data[i*4+2]=v;id.data[i*4+3]=255;}
      g.putImageData(id,0,0);scene.depth=c.toDataURL('image/png');
    }
    return scene;
  }
  $('#exp').addEventListener('click',function(){
    try{
      download(new Blob([JSON.stringify(buildScene())],{type:'application/json'}),'nuee-scene.json');
      setStatus('Scène exportée : nuee-scene.json');
    }catch(e){setStatus('Export impossible pour cette image')}
  });
  $('#copyCode').addEventListener('click',function(){
    var code='<div data-nuee="nuee-scene.json" style="width:100%;height:480px"></div>\n<script src="nuee-embed.js"><\/script>';
    var ok=function(){setStatus('Code copié. Place nuee-scene.json et nuee-embed.js à côté de ta page.')};
    var ko=function(){setStatus('Copie impossible : '+code.replace(/\n/g,' '))};
    try{navigator.clipboard.writeText(code).then(ok,ko)}catch(e){ko()}
  });
  var rec=null,chunks=[];
  $('#rec').addEventListener('click',function(){
    var btn=this;
    if(rec){rec.stop();return;}
    try{
      var type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].filter(function(t){return window.MediaRecorder&&MediaRecorder.isTypeSupported(t)})[0];
      if(!type){setStatus('Enregistrement non pris en charge par ce navigateur');return;}
      var stream=cv.captureStream(60);
      rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:16000000});chunks=[];
      rec.ondataavailable=function(e){if(e.data.size)chunks.push(e.data)};
      rec.onstop=function(){
        download(new Blob(chunks,{type:type}),'nuee-'+Date.now()+(type.indexOf('mp4')>-1?'.mp4':'.webm'));
        rec=null;btn.textContent='Enregistrer ●';btn.classList.remove('on');setStatus('');
      };
      rec.start();btn.textContent='Arrêter ■';btn.classList.add('on');setStatus('Enregistrement en cours…');
    }catch(e){setStatus('Enregistrement impossible ici');rec=null;}
  });
   
  /* ---------- démarrage ---------- */
  resize();window.drawAxisReady=true;applyTheme();
  var PHOTO='data:image/jpeg;base64,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';
  function start(list){
    images=list;
    var ph=autoPhoto(list[0]);
    buildThumbs();
    requestAnimationFrame(function(){
      show(0,true);
      $('#hint').classList.add('on');
      setTimeout(function(){$('#hint').classList.remove('on')},5200);
      if(ph){setStatus('Photo détectée : couleurs réelles activées');}
    });
  }
  toImage(PHOTO,'Photo').then(function(r){
    start([analyse(r.img,'Photo'),analyse(demoImage(),'Ripple')]);
  }).catch(function(){start([analyse(demoImage(),'Ripple')])});
  requestAnimationFrame(frame);
  })();