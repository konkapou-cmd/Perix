"""Reproduce the exact user-selected full-contour v2 preview (259 icons).

No new heuristics, redraw, upscale, lossy compression or automatic install.
The immutable v2 plan pins source hashes, component membership and output
hashes. Remaining captions are known review items, not permission to erase
parts of a shape. Requires Pillow, numpy, opencv-python.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image,ImageDraw

PLAN=Path(__file__).with_name('ui-artwork-v2-plan.json')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(input_dir,output):
    plan=json.loads(PLAN.read_text(encoding='utf-8'))
    assert plan['profile']=='user-selected-full-contours-v2'
    assert len(plan['icons'])==259 and plan['core_alpha_threshold']==160
    output.mkdir(parents=True,exist_ok=False)
    (output/'icons').mkdir();(output/'masks').mkdir()
    reproduced=0
    for sheet,metadata in plan['sources'].items():
        source_path=input_dir/metadata['filename']
        assert sha(source_path)==metadata['sha256'], f'Source changed: {metadata["filename"]}'
        source=Image.open(source_path).convert('RGBA');pixels=np.array(source);alpha=pixels[:,:,3]
        assert list(source.size)==metadata['size']
        # Exact v2 segmentation, not the rejected high-threshold experiment.
        core=(alpha>160).astype('uint8')
        rules=cv2.morphologyEx(core,cv2.MORPH_OPEN,np.ones((1,220),'uint8'))>0
        core[rules]=0
        _,labels,stats,_=cv2.connectedComponentsWithStats(core,8)
        _,nearest=cv2.distanceTransformWithLabels(1-core,cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_CCOMP)
        _,soft_labels,_,_=cv2.connectedComponentsWithStats((alpha>8).astype('uint8'),8)
        records=[row for row in plan['icons'] if row['sheet']==sheet]
        preview=Image.new('RGB',(7*174,((len(records)+6)//7)*178),'#edf3f7');draw=ImageDraw.Draw(preview)
        for index,row in enumerate(records):
            accepted=row['components'];distance_labels=[]
            for label in accepted:
                x,y,w,h,_=map(int,stats[label])
                yy,xx=np.where(labels[y:y+h,x:x+w]==label)
                distance_labels.append(int(nearest[y+yy[0],x+xx[0]]))
            protected=np.isin(labels,accepted)
            assert int(protected.sum())==row['preserved_core_pixels'],f'Component numbering changed: {row["target"]}'
            valid_soft=np.unique(soft_labels[protected]);valid_soft=valid_soft[valid_soft!=0]
            keep=np.isin(nearest,distance_labels)&np.isin(soft_labels,valid_soft)&(alpha>8)
            keep&=~rules
            halo=cv2.dilate(keep.astype('uint8'),np.ones((5,5),'uint8'))>0
            keep|=halo&(alpha>0)&(alpha<=8)
            assert np.all(keep[protected]),row['target']
            ys,xs=np.where(keep&(alpha>0));box=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
            assert box==row['source_box'],f'Contour differs from selected v2: {row["target"]}'
            x0,y0,x1,y1=box;tile=pixels[y0:y1,x0:x1].copy()
            tile[:,:,3]=np.where(keep[y0:y1,x0:x1],tile[:,:,3],0)
            sprite=Image.new('RGBA',(x1-x0+16,y1-y0+16));sprite.paste(Image.fromarray(tile),(8,8))
            assert list(sprite.size)==row['size']
            target=output/'icons'/row['target'];target.parent.mkdir(parents=True,exist_ok=True)
            mask=(output/'masks'/row['target']).with_suffix('.png');mask.parent.mkdir(parents=True,exist_ok=True)
            sprite.save(target,'WEBP',lossless=True,exact=True,method=6)
            sprite.getchannel('A').save(mask,optimize=True)
            assert sha(target)==row['sha256'],f'Image does not match approved v2: {row["target"]}'
            assert sha(mask)==row['mask_sha256'],f'Mask does not match approved v2: {row["target"]}'
            thumb=sprite.copy();thumb.thumbnail((158,140),Image.Resampling.LANCZOS)
            px=(index%7)*174;py=(index//7)*178
            preview.paste(thumb,(px+(174-thumb.width)//2,py+4+(140-thumb.height)//2),thumb)
            draw.text((px+3,py+148),row['id'][:25],fill='#16334b');reproduced+=1
        preview.save(output/f'{sheet}-review.png')
        assert sha(source_path)==metadata['sha256']
    (output/'mask-manifest.json').write_text(json.dumps(plan,indent=2),encoding='utf-8')
    assert reproduced==259
    print(json.dumps(dict(output=str(output),profile='user-selected-full-contours-v2',icons=reproduced,
        all_images_and_masks_identical_to_v2=True,app_images_changed=False)))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();extract(args.input_dir,args.output)
