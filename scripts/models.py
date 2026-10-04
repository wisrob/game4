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
        # Individual broad lance-shaped needles, with a painted ridge and gaps.
        # Large strokes survive the fixed gameplay zoom without hairline noise.
        stroke(256,20,256,475,5,(.14,.19,.12))
        def needle(start,end,width,shade):
            dx=end[0]-start[0];dy=end[1]-start[1];length=math.hypot(dx,dy)
            nx=-dy/length*width;ny=dx/length*width
            def point(t,w):return (start[0]+dx*t+nx*w,start[1]+dy*t+ny*w)
            polygon([point(0,0),point(.25,-.70),point(.58,-1),point(.83,-.55),point(1,0),point(.62,.75),point(.22,.55)],(.22*shade,.32*shade,.23*shade))
            polygon([point(.04,0),point(.25,-.70),point(.58,-1),point(.83,-.55),point(1,0),point(.58,0)],(.30*shade,.40*shade,.29*shade))
        for i in range(5):
            y=45+i*78;spread=205*(1-i/6.3)
            for side in [-1,1]:
                rise=75+rng.uniform(-8,12);shade=.85+rng.random()*.20
                needle((256,y),(256+side*spread,y+rise),42-i*3.5,shade)
        needle((256,395),(256,505),27,1.02)
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

def rounded(name, loc, scale, mat, segments=10, rings=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc)
    obj=bpy.context.object;obj.name=name;obj.scale=scale;obj.data.materials.append(mat)
    for face in obj.data.polygons:face.use_smooth=True
    return obj

def profile(name, levels, mat, sides=10, center=(0,0)):
    """Elliptical rings give clothing, boots and armor a fitted, tapered outline."""
    verts=[];faces=[]
    for z,rx,ry in levels:
        for i in range(sides):
            angle=math.tau*i/sides
            verts.append((center[0]+math.cos(angle)*rx,center[1]+math.sin(angle)*ry,z))
    for ring in range(len(levels)-1):
        for i in range(sides):
            a=ring*sides+i;b=ring*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((len(levels)-1)*sides+i for i in range(sides))])
    return sculpted_mesh(name,verts,faces,mat)

def limb(name, start, end, radius, mat, sides=8):
    midpoint=(Vector(start)+Vector(end))*.5;length=(Vector(end)-Vector(start)).length
    obj=part(name,midpoint,(radius,radius,length*.5),mat,'cylinder',sides)
    obj.rotation_euler=(Vector(end)-Vector(start)).to_track_quat('Z','Y').to_euler()
    return obj
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
for x in [-.19,.19]:
    profile('Turned leather boot',[(.04,.16,.25),(.18,.17,.26),(.27,.12,.15),(.42,.125,.15)],leather,8,(x,-.06))
    limb('Trouser leg',(x,0,.35),(x*.85,0,.78),.115,leather)
    part('Knee plate',(x,-.12,.57),(.12,.07,.12),steel,'sphere')
profile('Fitted tunic',[(.72,.28,.20),(.83,.27,.19),(1.12,.34,.23),(1.28,.28,.19)],cloak)
profile('Layered breastplate',[(.87,.275,.205),(1.04,.33,.25),(1.23,.31,.235)],steel)
sculpted_mesh('Draped cape',[(-.28,.24,1.3),(.28,.24,1.3),(-.43,.34,.48),(0,.42,.43),(.43,.34,.48),(0,.37,1.15)],[(0,2,5),(2,3,5),(3,4,5),(4,1,5),(1,0,5)],cloak)
rounded('Face',(0,-.015,1.51),(.205,.20,.23),skin,10,5)
rounded('Helmet crown',(0,.055,1.68),(.245,.23,.18),steel,8,5)
part('Nose',(0,-.212,1.51),(.045,.055,.065),skin,'sphere')
face=material('Face details',(.055,.043,.035))
for x in [-.09,.09]:
    part('Eye',(x,-.196,1.57),(.034,.021,.024),face,'sphere')
    part('Cheek guard',(x*2,-.09,1.51),(.035,.10,.14),steel,'cylinder',6)
part('Beard',(0,-.15,1.38),(.13,.085,.075),face,'sphere')
part('Helmet ridge',(0,.035,1.83),(.035,.14,.045),steel,'cylinder',6)
for side in [-1,1]:
    rounded('Shoulder pauldron',(side*.35,0,1.20),(.19,.22,.13),steel,8,5)
    limb('Upper sleeve',(side*.37,0,1.12),(side*.43,-.02,.95),.11,cloak)
    limb('Forearm bracer',(side*.43,-.02,.95),(side*.50,-.12,.83),.10,leather)
    part('Gloved hand',(side*.51,-.13,.81),(.10,.09,.095),skin,'sphere')
part('Belt',(0,0,.79),(.34,.25,.055),leather,'cylinder',8)
part('Belt clasp',(0,-.26,.80),(.06,.025,.05),steel)
# Hold the sword at the right hand, with the blade above the guard and a
# slight forward lean. Blender -Y is the exported character's +Z forward.
for name,height,scale,mat in [('Sword grip',.85,(.035,.04,.12),leather),('Guard',1.02,(.17,.055,.035),steel),('Pommel',.71,(.06,.05,.045),steel)]:
    offset=height-.85
    o=part(name,(.53,-.10-math.sin(.20)*offset,.85+math.cos(.20)*offset),scale,mat)
    o.rotation_euler[0]=.20
blade=sculpted_mesh('Diamond tapered sword',[(.46,-.13,1.04),(.60,-.13,1.04),(.53,-.18,1.04),(.53,-.08,1.04),(.48,-.22,1.79),(.58,-.22,1.79),(.53,-.26,1.79),(.53,-.18,1.79),(.53,-.27,1.99)],[(0,4,6,2),(2,6,5,1),(1,5,7,3),(3,7,4,0),(4,8,6),(6,8,5),(5,8,7),(7,8,4)],steel)
shield=material('Weathered shield',(.19,.12,.065))
o=part('Round shield',(-.58,-.12,.86),(.32,.39,.08),shield,'cylinder',12);o.rotation_euler[0]=math.pi/2
o=part('Shield rim',(-.58,-.125,.86),(.34,.41,.045),steel,'cylinder',12);o.rotation_euler[0]=math.pi/2
o=part('Shield inset',(-.58,-.18,.86),(.29,.36,.04),shield,'cylinder',12);o.rotation_euler[0]=math.pi/2
o=part('Shield boss',(-.58,-.215,.86),(.10,.05,.10),steel,'sphere')
save('wanderer')

reset();bark=material('Bark',(.12,.085,.065));leaf=foliage_material('pine-needles')
part('Trunk',(0,0,2.25),(.14,.14,2.25),bark,'cylinder',7)
# Open whorls of folded needle sprays expose branches and a feathered outline.
# Overlapping sprays retain canopy volume while exposing individual needles.
rng=random.Random(7);cards=[]
for tier in range(6):
    z=.80+tier*.72;radius=1.65*(1-tier/7.0)
    for j in range(6):
        angle=j*math.tau/6+tier*.67;length=radius*rng.uniform(.91,1.09)
        cards.append((angle,length,z,length*.72,.85))
foliage_cards('Broad individual needle sprays',leaf,cards)
save('pine')

reset();fern=material('Woodland leaves',(.16,.25,.15));verts=[];faces=[];colors=[];random.seed(28)
for branch in range(3):
    angle=branch*math.tau/3;length=random.uniform(.45,.7)
    for step in range(1):
        t=(step+1)/3;r=length*t;z=.18+math.sin(t*math.pi)*.5
        for side in [-1,1]:
            a=angle+side*.75;size=.23;start=len(verts)
            x=math.cos(angle)*r;y=math.sin(angle)*r
            verts.extend([(x,y,z),(x+math.cos(a)*size*.5-math.sin(a)*size*.45,y+math.sin(a)*size*.5+math.cos(a)*size*.45,z+.04),(x+math.cos(a)*size*1.7,y+math.sin(a)*size*1.7,z+.03),(x+math.cos(a)*size*.5+math.sin(a)*size*.45,y+math.sin(a)*size*.5-math.cos(a)*size*.45,z-.03)])
            shade=random.uniform(.85,1.1);colors.extend([(.16*shade,.25*shade,.15*shade)]*4);faces.extend([(start,start+1,start+2),(start,start+2,start+3)])
sculpted_mesh('Leafy understory',verts,faces,fern,colors)
save('fern')

reset();moss=material('Moss',(.19,.29,.16));dark=material('Dark eyes',(.025,.035,.02));bud=material('Old horn',(.38,.32,.22));hide=material('Mossling leather',(.11,.12,.085))
rounded('Hunched body',(0,.08,.89),(.40,.30,.38),hide)
rounded('Heavy jawed head',(0,-.12,1.38),(.34,.28,.29),moss,12,7)
part('Nose',(0,-.395,1.4),(.095,.1,.11),moss,'sphere')
rounded('Lower jaw',(0,-.23,1.20),(.24,.19,.10),moss,8,5)
profile('Scavenged chest armor',[(.74,.35,.28),(.98,.43,.32),(1.12,.33,.27)],hide,8,(0,.02))
profile('Rope belt',[(.72,.35,.28),(.79,.36,.29)],bud,8)
for x in [-.22,.22]:
    limb('Splayed shin',(x*1.25,-.04,.19),(x,.02,.65),.12,hide)
    profile('Wrapped boot',[(.04,.16,.23),(.20,.17,.24),(.33,.12,.13)],hide,8,(x*1.25,-.10))
    part('Eye',(x*.65,-.365,1.47),(.052,.025,.035),dark,'sphere')
    o=part('Long pointed ear',(x*1.7,-.06,1.49),(.115,.075,.26),moss,'cone',8);o.rotation_euler[1]=x*5
    limb('Long upper arm',(x*1.65,.02,1.08),(x*2.1,-.04,.86),.12,moss)
    limb('Forearm wrap',(x*2.1,-.04,.86),(x*2.5,-.18,.70),.11,hide)
    part('Hand',(x*2.5,-.18,.69),(.115,.10,.11),moss,'sphere')
    part('Heavy brow',(x*.65,-.35,1.54),(.10,.045,.043),moss,'sphere')
    part('Tusk',(x*.55,-.36,1.24),(.033,.034,.085),bud,'cone',6)
rounded('Asymmetric shoulder guard',(-.36,.02,1.10),(.24,.26,.14),steel,8,5)
part('Back crest',(0,.12,1.73),(.10,.13,.20),bud,'cone',8)
part('Spear shaft',(.61,-.12,1),(.025,.025,.87),shield,'cylinder')
part('Leaf spearhead',(.61,-.12,1.95),(.10,.055,.22),steel,'cone',4)
part('Spear socket',(.61,-.12,1.73),(.045,.045,.08),steel,'cylinder',8)
o=part('Shield',(-.52,-.12,.82),(.27,.32,.065),shield,'cylinder',10);o.rotation_euler[0]=math.pi/2
save('mossling')

reset();stone=material('Wardstone',(.28,.32,.33));rune=material('Rune glow',(.38,.57,.56))
profile('Shrine stepped plinth',[(0,.77,.60),(.14,.77,.60),(.24,.62,.48)],stone,8)
sculpted_mesh('Weathered monolith',[(-.56,-.38,0),(.55,-.38,0),(.48,.36,0),(-.48,.36,0),(-.32,-.33,1.9),(.34,-.31,1.77),(.30,.29,1.8),(-.30,.26,1.92)],[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],stone)
o=part('Rune stem',(0,-.365,1.18),(.018,.012,.21),rune);o.rotation_euler[1]=-.15
for x,z,a in [(-.075,1.23,-.8),(.07,1.32,-.7),(.06,1.06,.7)]:
    o=part('Rune branch',(x,-.368,z),(.018,.012,.10),rune);o.rotation_euler[1]=a
save('wardstone')

reset();rock=material('Slate',(.085,.11,.13))
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

reset();wood=material('Old timber',(.20,.12,.08));end=material('Cut wood',(.34,.25,.17))
o=part('Fallen trunk',(0,0,.28),(.25,.25,1.65),wood,'cylinder',9);o.rotation_euler[1]=math.pi/2
for x in [-1.66,1.66]:
    o=part('End grain',(x,0,.28),(.22,.22,.012),end,'cylinder',9);o.rotation_euler[1]=math.pi/2
o=part('Broken branch',(.3,0,.52),(.09,.09,.5),wood,'cylinder');o.rotation_euler[1]=.7
save('log')

reset();iron=material('Lantern iron',(.045,.055,.06));glow=material('Warm glass',(.72,.53,.29))
shader=glow.node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(.8,.52,.23,1);shader.inputs['Emission Strength'].default_value=.8
part('Post',(0,0,1.7),(.14,.14,1.7),wood);part('Crossbar',(.55,0,3.1),(.9,.12,.12),wood)
part('Hanger',(1.05,0,2.83),(.035,.035,.28),iron);part('Light',(1.05,0,2.43),(.14,.14,.23),glow)
part('Roof',(1.05,0,2.72),(.24,.24,.11),iron,'cone',4);part('Base',(1.05,0,2.17),(.20,.20,.06),iron)
for x in [.88,1.22]:
    for y in [-.17,.17]:part('Lantern frame',(x,y,2.44),(.025,.025,.25),iron)
limb('Angled post brace',(.05,0,2.5),(.65,0,3.10),.075,wood)
profile('Post stone footing',[(0,.27,.27),(.20,.27,.27),(.30,.19,.19)],stone,8)
save('lantern')

reset()
for i in range(9):part('Dock plank',((i-4)*.36,0,.20),(.17,1.35,.09),wood)
for x in [-1.5,1.5]:
    for y in [-1.1,1.1]:
        part('Dock pile',(x,y,.44),(.14,.14,.74),wood,'cylinder',8)
        part('Pale post cap',(x,y,1.19),(.17,.17,.06),end,'cylinder',8)
for x in [-1.52,1.52]:part('Dock edge beam',(x,0,.26),(.07,1.4,.14),end)
save('dock')
