"""Mask the unlabelled MD-X001..MD-X070 atlas without cutting grid cells.

Pillow + numpy + opencv-python; no model, recolouring, resizing or geocoding.
The zip's sheet_position maps IDs only. Its rectangular crop fields are audited
but NEVER used to trim the artwork. Output must be a NEW review directory.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def first_label_pixel(labels, stats, label):
    x, y, w, h, _ = map(int, stats[label])
    yy, xx = np.where(labels[y:y+h, x:x+w] == label)
    return y+int(yy[0]), x+int(xx[0])


def extract(sheet_path, locations_path, output, padding=8):
    source = Image.open(sheet_path).convert('RGBA')
    pixels = np.array(source); alpha = pixels[:, :, 3]
    locations = json.loads(locations_path.read_text(encoding='utf-8'))
    records = sorted(locations['locations'], key=lambda row: row['sheet_position'])
    assert len(records) == 70 and [row['sheet_position'] for row in records] == list(range(1,71))
    assert [row['icon_id'] for row in records] == [f'MD-X{i:03}' for i in range(1,71)]
    assert source.size == (locations['width'], locations['height'])

    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 128).astype('uint8'), 8)
    main = []
    for label in range(1,count):
        x,y,w,h,area = map(int,stats[label])
        if area > 4000 and w > 70 and h > 55:
            main.append(dict(label=label,x=x,y=y,w=w,h=h,area=area))
    rows=[]
    for comp in sorted(main,key=lambda comp:(comp['y'],comp['x'])):
        if not rows or comp['y']-min(c['y'] for c in rows[-1])>55:
            rows.append([comp])
        else:
            rows[-1].append(comp)
    assert len(main)==70 and [len(row) for row in rows]==[7]*10, 'Atlas layout needs manual review'
    ordered=[comp for row in rows for comp in sorted(row,key=lambda comp:comp['x'])]
    main_ids={comp['label'] for comp in main}
    main_mask=np.isin(labels,list(main_ids)).astype('uint8')
    distance,nearest_main=cv2.distanceTransformWithLabels(1-main_mask,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_CCOMP)
    _,nearest_opaque=cv2.distanceTransformWithLabels((alpha<=128).astype('uint8'),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_CCOMP)
    main_owner={}
    for comp in main:
        y,x=first_label_pixel(labels,stats,comp['label'])
        main_owner[int(nearest_main[y,x])]=comp['label']
    assignments={label:[] for label in main_ids};opaque_id={};unassigned=[]
    for label in range(1,count):
        y,x=first_label_pixel(labels,stats,label);opaque_id[label]=int(nearest_opaque[y,x])
        if label in main_ids:
            assignments[label].append(label);continue
        x,y,w,h,area=map(int,stats[label]);local=labels[y:y+h,x:x+w]==label
        distances=distance[y:y+h,x:x+w][local]
        if float(distances.min())>24:
            unassigned.append(dict(label=label,box=[x,y,w,h],area=area));continue
        votes=nearest_main[y:y+h,x:x+w][local]
        owner=main_owner[int(np.bincount(votes).argmax())]
        assignments[owner].append(label)
    assert not unassigned, f'Detached artwork needs manual assignment: {unassigned}'

    # Keep weak-alpha fringe/shadow components only if they actually touch an
    # opaque illustration. This discards the atlas's almost-transparent matte.
    _,soft_labels,_,_=cv2.connectedComponentsWithStats((alpha>8).astype('uint8'),8)
    valid_soft=np.unique(soft_labels[alpha>128])
    soft_art=np.isin(soft_labels,valid_soft)&(alpha>8)
    output.mkdir(parents=True,exist_ok=False)
    (output/'icons').mkdir();(output/'masks').mkdir()
    preview=Image.new('RGB',(7*180,10*174),'#edf3f7');draw=ImageDraw.Draw(preview)
    manifest=dict(source_name=sheet_path.name,source_sha256=sha(sheet_path),source_size=list(source.size),
        locations_sha256=sha(locations_path),method='opaque component ownership masks; metadata crop rectangles ignored',
        core_alpha_threshold=128,matte_alpha_threshold=8,padding=padding,icons=[])
    covered=np.zeros(alpha.shape,'uint8')
    for index,(comp,location) in enumerate(zip(ordered,records),1):
        icon_id=location['icon_id'];filename=icon_id.lower()
        accepted=[opaque_id[label] for label in assignments[comp['label']]]
        keep=np.isin(nearest_opaque,accepted)&soft_art
        halo=cv2.dilate(keep.astype('uint8'),np.ones((5,5),'uint8'))>0
        keep|=halo&(alpha>0)&(alpha<=8)
        protected=np.isin(labels,assignments[comp['label']])
        assert np.all(keep[protected]), f'Opaque artwork lost for {icon_id}'
        covered[protected]+=1
        ys,xs=np.where(keep&(alpha>0));x0,x1,y0,y1=int(xs.min()),int(xs.max()+1),int(ys.min()),int(ys.max()+1)
        tile=pixels[y0:y1,x0:x1].copy();tile[:,:,3]=np.where(keep[y0:y1,x0:x1],tile[:,:,3],0)
        sprite=Image.new('RGBA',(x1-x0+2*padding,y1-y0+2*padding))
        sprite.paste(Image.fromarray(tile),(padding,padding))
        mask=sprite.getchannel('A');bbox=mask.getbbox()
        assert min(bbox[0],bbox[1],sprite.width-bbox[2],sprite.height-bbox[3])>=padding
        icon_path=output/'icons'/f'{filename}.webp';mask_path=output/'masks'/f'{filename}.png'
        sprite.save(icon_path,'WEBP',lossless=True,exact=True,method=6);mask.save(mask_path,optimize=True)
        decoded=np.array(Image.open(icon_path).convert('RGBA'));visible=decoded[:,:,3]>0
        assert np.array_equal(decoded[visible],np.array(sprite)[visible]), 'Visible source RGBA changed'
        crop=location['crop'];inside=np.zeros(alpha.shape,'bool')
        inside[crop['y']:crop['y']+crop['height'],crop['x']:crop['x']+crop['width']]=True
        outside_old=int((protected&~inside).sum())
        manifest['icons'].append(dict(id=icon_id,sheet_position=index,source_box=[x0,y0,x1,y1],
            original_opaque_pixels=int(protected.sum()),preserved_opaque_pixels=int(keep[protected].sum()),
            main_component_pixels=comp['area'],detached_components=[label for label in assignments[comp['label']] if label!=comp['label']],
            old_crop=crop,restored_opaque_pixels_outside_old_crop=outside_old,size=list(sprite.size),alpha_bbox=list(bbox),
            sha256=sha(icon_path),mask_sha256=sha(mask_path),source_boundary_touch=x0==0 or y0==0 or x1==source.width or y1==source.height,
            opaque_source_boundary_touch=bool(protected[0].any() or protected[-1].any() or protected[:,0].any() or protected[:,-1].any())))
        thumb=sprite.copy();thumb.thumbnail((170,144),Image.Resampling.LANCZOS)
        px,py=((index-1)%7)*180,((index-1)//7)*174
        preview.paste(thumb,(px+(180-thumb.width)//2,py+4+(144-thumb.height)//2),thumb)
        draw.text((px+8,py+151),icon_id,fill='#18334a')
    assert np.all(covered[alpha>128]==1), 'Opaque artwork must be preserved exactly once across all 70 masks'
    manifest['source_opaque_pixels']=int((alpha>128).sum())
    manifest['preserved_opaque_pixels']=int(covered[alpha>128].sum())
    manifest['restored_outside_old_crops']=sum(row['restored_opaque_pixels_outside_old_crop'] for row in manifest['icons'])
    (output/'mask-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    preview.save(output/'all-70-review.png')
    assert sha(sheet_path)==manifest['source_sha256']
    print(json.dumps(dict(output=str(output),icons=70,source_unchanged=True,all_opaque_pixels_preserved=True,
        restored_outside_old_crops=manifest['restored_outside_old_crops'])))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sheet',type=Path,required=True)
    parser.add_argument('--locations',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();extract(args.sheet,args.locations,args.output)
