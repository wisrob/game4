"""Biome kit, executed by models.py with its shared Blender modeling helpers."""
reset()
bark=material('Weathered bark',(.25,.16,.10));leaf=material('Frost needles',(.16,.27,.25));snow=material('Powder snow',(.86,.93,.94))
profile('Pine trunk',[(0,.23,.21),(1,.20,.18),(5.8,.045,.045)],bark,7)
for i in range(5):
    z=1.2+i*.92;r=1.7-i*.29
    profile('Evergreen skirt',[(z,r,r),(z+.85,r*.38,r*.38),(z+1.1,.015,.015)],leaf,9)
    profile('Heavy snow cap',[(z+.32,r*.79,r*.79),(z+.89,r*.36,r*.36),(z+1.12,.015,.015)],snow,9)
save('snow-pine')

reset();bark=material('Sun bleached wood',(.43,.34,.24))
limb('Twisted bole',(0,0,0),(.15,.1,3.8),.19,bark,7)
for i in range(5):
    a=i*2.4;z=1.4+i*.43;end=(math.cos(a)*1.5,math.sin(a)*1.5,z+.95)
    limb('Bare branch',(.08,0,z),end,.09,bark,6)
    limb('Broken twig',end,(end[0]*1.2,end[1]*1.2,end[2]+.65),.035,bark,5)
save('dead-tree')

reset();bark=material('Palm bark',(.39,.26,.14));leaf=material('Palm fronds',(.19,.40,.20))
profile('Curved segmented palm',[(0,.27,.24),(1,.24,.22),(2,.21,.20),(3,.18,.18),(4,.15,.15),(5,.12,.12)],bark,8)
for i in range(9):
    a=i*math.tau/9;dx=math.cos(a);dy=math.sin(a);nx=-dy;ny=dx
    sculpted_mesh('Broad arching palm frond',[(0,0,5),(dx*1.2+nx*.45,dy*1.2+ny*.45,5.35),(dx*2.8,dy*2.8,4.45),(dx*1.2-nx*.45,dy*1.2-ny*.45,5.35),(dx*1.2,dy*1.2,5.5)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],leaf)
save('palm')

reset();green=material('Cactus wax',(.24,.38,.23));flower=material('Cactus blossom',(.77,.40,.32))
profile('Ribbed cactus',[(0,.36,.33),(2.4,.34,.32),(2.7,.19,.19),(2.8,.01,.01)],green,10)
for side,z in [(-1,1.1),(1,1.6)]:
    limb('Cactus arm',(0,0,z),(side*.7,0,z),.18,green,8)
    limb('Raised cactus arm',(side*.7,0,z),(side*.7,0,z+.8),.18,green,8)
part('Desert flower',(.7,0,2.45),(.16,.16,.08),flower,'sphere');save('cactus')

reset();stone=material('Ruined limestone',(.49,.48,.40));dark=material('Worn masonry',(.36,.38,.33))
for side in [-1,1]:
    for i in range(4):part('Portal column',(side*2.1,0,.45+i*.85),(.55,.70,.40),stone)
for i in range(7):
    a=i*math.pi/6
    o=part('Broken arch voussoir',(math.cos(a)*2.1,0,3+math.sin(a)*1.7),(.52,.66,.44),stone);o.rotation_euler[1]=-a
for i in range(6):
    part('Broken wall',(-2.8,i*.8, .5+(i%3)*.3),(.6,.36,.48),dark)
for i in range(6):part('Fallen stone',(math.sin(i*4)*3,math.cos(i*3)*2,.16),(.35,.3,.16),stone)
save('ruin')

for snowy in [False,True]:
    reset();wall=material('Lime plaster',(.73,.67,.50));wood=material('Town timber',(.26,.17,.105));roof=material('Snow roof' if snowy else 'Terracotta roof',(.86,.93,.94) if snowy else (.43,.20,.12));glass=material('Amber windows',(.76,.57,.27))
    part('Stone foundation',(0,0,.18),(3.25,2.65,.18),wood)
    part('Plaster house',(0,0,1.65),(3,2.4,1.5),wall)
    for x in [-2.95,0,2.95]:
        for y in [-2.42,2.42]:part('Timber frame',(x,y,1.65),(.09,.08,1.5),wood)
    for z in [.4,2.9]:
        for y in [-2.44,2.44]:part('Timber rail',(0,y,z),(3.05,.075,.075),wood)
    sculpted_mesh('Gabled roof',[(-3.5,-2.9,3), (3.5,-2.9,3),(-3.5,0,4.8),(3.5,0,4.8),(-3.5,2.9,3),(3.5,2.9,3)],[(0,1,3,2),(2,3,5,4),(0,2,4),(1,5,3)],roof)
    part('Door',(0,-2.43,1.05),(.54,.06,.85),wood)
    for x in [-1.7,1.7]:
        part('Window frame',(x,-2.46,1.8),(.55,.07,.62),wood)
        part('Window glass',(x,-2.54,1.8),(.43,.025,.5),glass)
        part('Window mullion',(x,-2.58,1.8),(.03,.025,.5),wood)
    part('Chimney',(1.8,.65,4.2),(.35,.40,1),wood)
    save('snow-house' if snowy else 'house')
