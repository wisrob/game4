"""Reproducible low-poly models. Run via mise run assets; Z-up is converted by glTF."""
import bpy, math, os, random
from array import array
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
SOURCE = os.path.join(ROOT, 'assets', 'blender')
os.makedirs(OUT, exist_ok=True)
os.makedirs(SOURCE, exist_ok=True)
TEXTURES = os.path.join(ROOT, 'public', 'textures')
os.makedirs(TEXTURES, exist_ok=True)

def foliage_material(name, fern=False):
    """Paint broad, faceted evergreen tufts; transparent gaps shape the silhouette."""
    size=512;pixels=array('f', [.10,.17,.08,0])*(size*size);rng=random.Random(19 if fern else 8)
    def stroke(x0,y0,x1,y1,width,color):
        steps=max(1,int(math.hypot(x1-x0,y1-y0)*1.5))
        for step in range(steps+1):
            t=step/steps;x=x0+(x1-x0)*t;y=y0+(y1-y0)*t;r=width*(1-.55*t)
            for iy in range(max(0,int(y-r-1)),min(size,int(y+r+2))):
                for ix in range(max(0,int(x-r-1)),min(size,int(x+r+2))):
                    alpha=max(0,min(1,r+.5-math.hypot(ix-x,iy-y)))
                    k=(iy*size+ix)*4
                    if alpha>pixels[k+3]:pixels[k:k+4]=array('f', (*color,alpha))
    def polygon(points,color):
        for iy in range(max(0,int(min(p[1] for p in points))),min(size,int(max(p[1] for p in points))+1)):
            crossings=[]
            for a,b in zip(points,points[1:]+points[:1]):
                if (a[1]<=iy+.5<b[1]) or (b[1]<=iy+.5<a[1]):crossings.append(a[0]+(iy+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]))
            crossings.sort()
            for left,right in zip(crossings[::2],crossings[1::2]):
                for ix in range(max(0,int(left)),min(size,int(right)+1)):
                    k=(iy*size+ix)*4;pixels[k:k+4]=array('f',(*color,1))
    if fern:
        stroke(256,18,256,490,2.8,(.25,.28,.12))
        for i in range(23):
            y=45+i*18;spread=(math.sin((i/25)*math.pi)*.65+.28)*190
            for side in [-1,1]:
                endx=256+side*spread;endy=y+38+rng.uniform(-7,7)
                stroke(256,y,endx,endy,3,(.17,.25,.10))
                for j in range(1,14):
                    t=j/14;x=256+(endx-256)*t;yy=y+(endy-y)*t
                    length=12+rng.random()*10;shade=.82+rng.random()*.4;color=(.25*shade,.37*shade,.16*shade)
                    for direction in [-1,1]:stroke(x,yy,x+side*length*.65,yy+direction*length,3.8,color)
    else:
        # A handful of large pointed lobes replaces dozens of hairline needles.
        stroke(256,18,256,488,7,(.25,.29,.16))
        for i in range(3):
            y=72+i*146;spread=184*pow(1-i/3.8,.75)+10
            for side in [-1,1]:
                rise=28+rng.uniform(-6,6);shade=.9+rng.random()*.18
                def shape(points):return [(256+side*u*spread,y+v*2.5+u*rise) for u,v in points]
                polygon(shape([(0,-16),(.28,-22),(.40,-34),(.48,-16),(.69,-29),(.66,-7),(1,-4),(.84,15),(.65,25),(.38,26),(.14,19),(0,15)]),(.235*shade,.32*shade,.235*shade))
                polygon(shape([(0,-13),(.28,-19),(.40,-30),(.43,-9),(.68,-25),(.60,-2),(.86,-2),(.63,8),(.24,8)]),(.30*shade,.36*shade,.24*shade))
                polygon(shape([(.69,-5),(1,-4),(.84,12),(.74,8)]),(.39*shade,.405*shade,.245*shade))
    image=bpy.data.images.new(name,width=size,height=size,alpha=True);image.pixels.foreach_set(pixels)
    image.filepath_raw=os.path.join(TEXTURES,name+'.png');image.file_format='PNG';image.save();image.pack()
    mat=material(name,(1,1,1));mat.use_backface_culling=False
    if hasattr(mat,'surface_render_method'):mat.surface_render_method='DITHERED'
    if hasattr(mat,'alpha_threshold'):mat.alpha_threshold=.4
    shader=mat.node_tree.nodes.get('Principled BSDF');tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
    return mat

def foliage_cards(name,mat,cards):
    verts=[];faces=[];uvs=[]
    for angle,radius,z,width,rise in cards:
        start=len(verts)
        for t in [0,.5,1]:
            for side in [-1,1]:
                r=.10+radius*t;w=side*width
                verts.append((math.cos(angle)*r-math.sin(angle)*w,math.sin(angle)*r+math.cos(angle)*w,z+rise*(1-t)-.10*t))
                uvs.append(((side+1)/2,t))
        faces.extend([(start+2,start+3,start+1,start),(start+4,start+5,start+3,start+2)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(mat)
    layer=mesh.uv_layers.new(name='Sprig UV')
    for polygon in mesh.polygons:
        for loop in polygon.loop_indices:layer.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)

def material(name, color):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .85
    return m
def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def sculpted_mesh(name, verts, faces, mat, colors=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();mesh.materials.append(mat)
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    if colors:
        attr=mesh.color_attributes.new(name='Foliage tones',type='FLOAT_COLOR',domain='CORNER')
        for poly in mesh.polygons:
            for loop in poly.loop_indices:attr.data[loop].color=(*colors[mesh.loops[loop].vertex_index],1)
        shader=mat.node_tree.nodes.get('Principled BSDF');node=mat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name=attr.name
        mat.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
    return obj
def part(name, loc, scale, mat, kind='cube', vertices=6):
    if kind == 'cone': bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=1, radius2=0, depth=2, location=loc)
    elif kind == 'sphere': bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=loc)
    elif kind == 'cylinder': bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=1, depth=2, location=loc)
    else: bpy.ops.mesh.primitive_cube_add(size=2, location=loc)
    o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(mat); return o
def save(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Static parts sharing a material are one exported primitive.
    groups={}
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH':groups.setdefault(obj.data.materials[0].name,[]).append(obj)
    for objects in groups.values():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE, name+'.blend'))
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'), export_format='GLB', export_yup=True)

reset()
leather=material('Midnight leather',(.045,.075,.10)); cloak=material('Blue wool cloak',(.055,.12,.21)); steel=material('Old silver',(.32,.38,.40)); skin=material('Skin',(.55,.35,.21))
part('Boot left',(-.20,0,.18),(.16,.23,.18),leather); part('Boot right',(.20,0,.18),(.16,.23,.18),leather)
for x in [-.19,.19]:part('Trouser leg',(x,0,.52),(.14,.18,.26),leather,'cylinder',8)
part('Tunic',(0,0,.99),(.32,.23,.35),cloak,'cylinder',8)
sculpted_mesh('Draped cape',[(-.28,.24,1.3),(.28,.24,1.3),(-.43,.34,.48),(0,.42,.43),(.43,.34,.48),(0,.37,1.15)],[(0,2,5),(2,3,5),(3,4,5),(4,1,5),(1,0,5)],cloak)
part('Head',(0,0,1.52),(.22,.21,.25),skin,'sphere')
part('Steel helmet',(0,.025,1.64),(.25,.24,.28),steel,'sphere');part('Nose guard',(0,-.23,1.57),(.025,.025,.18),steel)
part('Shoulder left',(-.36,0,1.18),(.19,.23,.16),steel,'sphere');part('Shoulder right',(.36,0,1.18),(.19,.23,.16),steel,'sphere')
part('Belt',(0,0,.79),(.34,.25,.055),leather,'cylinder',8)
part('Arm left',(-.43,0,.92),(.11,.13,.24),cloak,'cylinder',8);part('Arm right',(.43,0,.92),(.11,.13,.24),cloak,'cylinder',8)
# Hold the sword at the right hand, with the blade above the guard and a
# slight forward lean. Blender -Y is the exported character's +Z forward.
for name,height,scale,mat in [('Sword grip',.85,(.035,.04,.12),leather),('Guard',1.02,(.15,.06,.035),steel),('Sword',1.51,(.035,.05,.47),steel)]:
    offset=height-.85
    o=part(name,(.53,-.10-math.sin(.20)*offset,.85+math.cos(.20)*offset),scale,mat)
    o.rotation_euler[0]=.20
shield=material('Weathered shield',(.19,.12,.065))
o=part('Round shield',(-.58,-.12,.86),(.32,.39,.08),shield,'cylinder',12);o.rotation_euler[0]=math.pi/2
o=part('Shield boss',(-.58,-.215,.86),(.10,.05,.10),steel,'sphere')
save('wanderer')

reset();bark=material('Bark',(.16,.105,.065));leaf=foliage_material('pine-needles')
part('Trunk',(0,0,2.25),(.14,.14,2.25),bark,'cylinder',7)
# Folded alpha cards carry the branch silhouette, tufts and gaps, with no solid leaf shell.
random.seed(7);cards=[]
for tier in range(7):
    z=.8+tier*.65;radius=1.5*(1-tier/7.7)
    for j in range(5):
        angle=j*math.tau/5+tier*.61;length=radius*random.uniform(.88,1.12)
        cards.append((angle,length,z,length*.56,.66))
foliage_cards('Alpha-cutout evergreen boughs',leaf,cards)
save('pine')

reset();fern=material('Woodland leaves',(.27,.34,.10));verts=[];faces=[];colors=[];random.seed(28)
for branch in range(5):
    angle=branch*math.tau/5;length=random.uniform(.45,.7)
    for step in range(2):
        t=(step+1)/3;r=length*t;z=.18+math.sin(t*math.pi)*.5
        for side in [-1,1]:
            a=angle+side*.75;size=.14*(1-t*.35);start=len(verts)
            x=math.cos(angle)*r;y=math.sin(angle)*r
            verts.extend([(x,y,z),(x+math.cos(a)*size*.5-math.sin(a)*size*.45,y+math.sin(a)*size*.5+math.cos(a)*size*.45,z+.04),(x+math.cos(a)*size*1.7,y+math.sin(a)*size*1.7,z+.03),(x+math.cos(a)*size*.5+math.sin(a)*size*.45,y+math.sin(a)*size*.5-math.cos(a)*size*.45,z-.03)])
            shade=random.uniform(.8,1.25);colors.extend([(.22*shade,.30*shade,.095*shade)]*4);faces.extend([(start,start+1,start+2),(start,start+2,start+3)])
sculpted_mesh('Leafy understory',verts,faces,fern,colors)
save('fern')

reset();moss=material('Moss',(.24,.32,.075));dark=material('Dark eyes',(.025,.035,.02));bud=material('Golden buds',(.55,.37,.08));hide=material('Mossling leather',(.12,.14,.075))
part('Body',(0,0,.91),(.36,.25,.39),hide,'sphere');part('Head',(0,-.03,1.42),(.31,.27,.28),moss,'sphere')
part('Nose',(0,-.29,1.4),(.095,.1,.11),moss,'sphere')
part('Lower jaw',(0,-.15,1.25),(.20,.18,.11),moss,'sphere')
for x in [-.22,.22]:
    part('Leg',(x,0,.40),(.12,.14,.28),hide,'cylinder',7);part('Foot',(x,-.10,.13),(.15,.22,.13),hide,'sphere')
    part('Eye',(x*.6,-.27,1.49),(.045,.03,.035),dark,'sphere')
    o=part('Ear',(x*1.55,0,1.49),(.12,.09,.22),moss,'cone');o.rotation_euler[1]=x*5
    o=part('Arm',(x*2,0,.94),(.10,.13,.32),moss,'cylinder',7);o.rotation_euler[1]=x
    part('Brow',(x*.6,-.265,1.55),(.085,.045,.035),moss,'sphere')
part('Bud',(0,.03,1.77),(.12,.12,.16),bud,'cone')
part('Spear shaft',(.61,-.12,1),(.025,.025,.87),shield,'cylinder')
part('Spear tip',(.61,-.12,1.95),(.07,.045,.16),steel,'cone')
o=part('Shield',(-.52,-.12,.82),(.27,.32,.065),shield,'cylinder',10);o.rotation_euler[0]=math.pi/2
save('mossling')

reset();stone=material('Wardstone',(.23,.28,.29));rune=material('Rune glow',(.43,.82,.81))
sculpted_mesh('Weathered monolith',[(-.56,-.38,0),(.55,-.38,0),(.48,.36,0),(-.48,.36,0),(-.32,-.33,1.9),(.34,-.31,1.77),(.30,.29,1.8),(-.30,.26,1.92)],[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],stone)
o=part('Rune stem',(0,-.365,1.18),(.018,.012,.21),rune);o.rotation_euler[1]=-.15
for x,z,a in [(-.075,1.23,-.8),(.07,1.32,-.7),(.06,1.06,.7)]:
    o=part('Rune branch',(x,-.368,z),(.018,.012,.10),rune);o.rotation_euler[1]=a
save('wardstone')

reset();rock=material('Slate',(.16,.19,.21))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(0,0,.55));o=bpy.context.object;o.name='Split boulder';o.scale=(1,.75,.85);o.data.materials.append(rock);o.rotation_euler=(.12,.22,.31)
random.seed(12)
for v in o.data.vertices:
    v.co*=random.uniform(.82,1.12)
    v.co.z=max(-.62,v.co.z)
    v.co.x=round(v.co.x*5)/5
    v.co.y=round(v.co.y*5)/5
modifier=o.modifiers.new('Broad stone planes','DECIMATE');modifier.ratio=.65
bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=modifier.name)
save('boulder')

reset();wood=material('Old timber',(.22,.13,.065));end=material('Cut wood',(.42,.29,.13))
o=part('Fallen trunk',(0,0,.28),(.25,.25,1.65),wood,'cylinder',9);o.rotation_euler[1]=math.pi/2
for x in [-1.66,1.66]:
    o=part('End grain',(x,0,.28),(.22,.22,.012),end,'cylinder',9);o.rotation_euler[1]=math.pi/2
o=part('Broken branch',(.3,0,.52),(.09,.09,.5),wood,'cylinder');o.rotation_euler[1]=.7
save('log')

reset();iron=material('Lantern iron',(.085,.075,.05));glow=material('Warm glass',(.95,.58,.16))
shader=glow.node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(1,.46,.08,1);shader.inputs['Emission Strength'].default_value=2
part('Post',(0,0,1.7),(.14,.14,1.7),wood);part('Crossbar',(.55,0,3.1),(.9,.12,.12),wood)
part('Hanger',(1.05,0,2.83),(.035,.035,.28),iron);part('Light',(1.05,0,2.43),(.14,.14,.23),glow)
part('Roof',(1.05,0,2.72),(.24,.24,.11),iron,'cone',4);part('Base',(1.05,0,2.17),(.20,.20,.06),iron)
save('lantern')

reset()
for i in range(9):part('Dock plank',((i-4)*.36,0,.20),(.17,1.35,.09),wood)
for x in [-1.5,1.5]:
    for y in [-1.1,1.1]:part('Dock pile',(x,y,.37),(.12,.12,.65),wood)
save('dock')
