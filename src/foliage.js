import * as T from 'three';

// Ordinary mipmaps average narrow needles into transparent texels. Preserve
// the occupied area at each level so boughs keep their silhouette at distance.
export function configureCutoutTexture(texture, renderer, cutoff) {
  const image=texture.image,base=document.createElement('canvas');
  base.width=image.width;base.height=image.height;
  const paint=base.getContext('2d',{willReadFrequently:true});paint.drawImage(image,0,0);
  const rgba=paint.getImageData(0,0,base.width,base.height).data;
  let occupied=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>=cutoff*255)occupied++;
  const coverage=occupied/(rgba.length/4),mips=[base];
  let previous=base;
  while(previous.width>1||previous.height>1){
    const level=document.createElement('canvas');level.width=Math.max(1,previous.width>>1);level.height=Math.max(1,previous.height>>1);
    const ctx=level.getContext('2d',{willReadFrequently:true});ctx.drawImage(previous,0,0,level.width,level.height);
    const pixels=ctx.getImageData(0,0,level.width,level.height),alphas=[];
    for(let i=3;i<pixels.data.length;i+=4)alphas.push(pixels.data[i]);
    alphas.sort((a,b)=>b-a);
    const boundary=alphas[Math.max(0,Math.ceil(alphas.length*coverage)-1)];
    const scale=boundary?Math.min(4,cutoff*255/boundary):1;
    for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.min(255,Math.round(pixels.data[i]*scale));
    ctx.putImageData(pixels,0,0);mips.push(level);previous=level;
  }
  texture.image=base;texture.mipmaps=mips;texture.generateMipmaps=false;
  texture.minFilter=T.LinearMipmapLinearFilter;
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
}
