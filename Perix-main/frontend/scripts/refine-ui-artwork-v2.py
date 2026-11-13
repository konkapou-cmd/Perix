"""Conservative, individual cleanup ON TOP of the immutable v2 subject masks.

Only named caption components / reviewed polygons may remove pixels. Every
other figure pixel retains its original RGB/alpha; there is no subject erosion
or global segmentation threshold change. Creates a new review folder only.
"""
import argparse,hashlib,json,shutil
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).parent
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def polygon_mask(size,polygons):
    mask=Image.new('L',size);draw=ImageDraw.Draw(mask)
    for points in polygons:draw.polygon([tuple(p) for p in points],fill=255)
    return np.array(mask)>0

def refine(baseline,output):
    plan=json.loads((ROOT/'ui-artwork-v2-plan.json').read_text(encoding='utf-8'))
    annotations=json.loads((ROOT/'ui-artwork-v2-cleanup.json').read_text(encoding='utf-8'))
    assert plan['profile']==annotations['base_profile']
    edits={row['target']:row for row in annotations['edits']}
    assert len(edits)==len(annotations['edits'])
    output.mkdir(parents=True,exist_ok=False)
    manifest=dict(profile='v2-individual-caption-cleanup',base_profile=plan['profile'],icons=[],subject_pixels_removed=0)
    for row in plan['icons']:
        source=baseline/'icons'/row['target'];assert sha(source)==row['sha256']
        original=np.array(Image.open(source).convert('RGBA'));alpha=original[:,:,3]
        cleaned=original.copy();remove=np.zeros(alpha.shape,'bool');protected=alpha>240
        edit=edits.get(row['target'])
        if edit:
            if 'remove_core' in edit or 'keep_core' in edit:
                count,labels,stats,_=cv2.connectedComponentsWithStats((alpha>240).astype('uint8'),8)
                chosen=edit['remove_core'] if 'remove_core' in edit else [label for label in range(1,count) if label not in edit['keep_core']]
                for label in chosen:
                    assert 0<label<count
                    if str(label) in edit.get('expected_boxes',{}):assert list(map(int,stats[label][:4]))==edit['expected_boxes'][str(label)]
                _,nearest=cv2.distanceTransformWithLabels((alpha<=240).astype('uint8'),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_CCOMP)
                for label in chosen:
                    yy,xx=np.where(labels==label);owner=int(nearest[yy[0],xx[0]])
                    x,y,w,h,_=map(int,stats[label]);envelope=np.zeros(alpha.shape,'bool')
                    envelope[max(0,y-3):min(alpha.shape[0],y+h+3),max(0,x-3):min(alpha.shape[1],x+w+3)]=True
                    remove|=(nearest==owner)&envelope&(alpha>0)
                protected&=~np.isin(labels,chosen)
            if 'keep_soft' in edit:
                count,labels,_,_=cv2.connectedComponentsWithStats((alpha>8).astype('uint8'),8)
                assert all(0<label<count for label in edit['keep_soft'])
                _,nearest=cv2.distanceTransformWithLabels((alpha<=8).astype('uint8'),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_CCOMP)
                kept=[]
                for label in edit['keep_soft']:
                    yy,xx=np.where(labels==label);kept.append(int(nearest[yy[0],xx[0]]))
                remove|=~np.isin(nearest,kept)&(alpha>0)
                protected=(alpha>8)&np.isin(labels,edit['keep_soft'])
            if 'erase_polygons' in edit:
                selected=polygon_mask(Image.fromarray(alpha).size,edit['erase_polygons'])
                assert not np.any(selected&protected),f'Polygon hits protected subject: {row["target"]}'
                remove|=selected&(alpha>0)
            if 'erase_ink_polygons' in edit:
                selected=polygon_mask(Image.fromarray(alpha).size,edit['erase_ink_polygons'])
                r,g,b=original[:,:,0].astype('int16'),original[:,:,1].astype('int16'),original[:,:,2].astype('int16')
                ink=selected&(alpha>8)&(r<110)&(g<130)&(b<190)&(b>r+12)
                remove|=(cv2.dilate(ink.astype('uint8'),np.ones((3,3),'uint8'))>0)&selected&(alpha>0)
                # This explicitly reviewed text region is outside the actual
                # figure even where caption ink shares a faint alpha bridge.
                protected&=~selected
            assert not np.any(remove&protected),f'Cleanup cuts a protected part: {row["target"]}'
            cleaned[:,:,3][remove]=0
            assert np.array_equal(cleaned[protected],original[protected])
            assert np.array_equal(cleaned[~remove],original[~remove])
        target=output/'icons'/row['target'];target.parent.mkdir(parents=True,exist_ok=True)
        mask=(output/'masks'/row['target']).with_suffix('.png');mask.parent.mkdir(parents=True,exist_ok=True)
        if edit:
            image=Image.fromarray(cleaned);bbox=image.getchannel('A').getbbox();assert bbox
            trimmed=image.crop(bbox);sprite=Image.new('RGBA',(trimmed.width+16,trimmed.height+16));sprite.paste(trimmed,(8,8))
            sprite.save(target,'WEBP',lossless=True,exact=True,method=6);sprite.getchannel('A').save(mask,optimize=True)
            decoded=np.array(Image.open(target).convert('RGBA'));visible=decoded[:,:,3]>0
            assert np.array_equal(decoded[visible],np.array(sprite)[visible])
            offset=[bbox[0]-8,bbox[1]-8]
        else:
            shutil.copy2(source,target);shutil.copy2((baseline/'masks'/row['target']).with_suffix('.png'),mask)
            sprite=Image.open(target).convert('RGBA');offset=[0,0]
            assert sha(target)==row['sha256']
        manifest['icons'].append(dict(target=row['target'],id=row['id'],sheet=row['sheet'],base_sha256=row['sha256'],
            sha256=sha(target),mask_sha256=sha(mask),edited=bool(edit),removed_caption_pixels=int(remove.sum()),
            protected_subject_pixels=int(protected.sum()),protected_subject_pixels_removed=0,
            size=list(sprite.size),alpha_bbox=list(sprite.getchannel('A').getbbox()),baseline_offset=offset))
    assert len(manifest['icons'])==259
    (output/'mask-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    for sheet in plan['sources']:
        records=[row for row in manifest['icons'] if row['sheet']==sheet]
        preview=Image.new('RGB',(7*174,((len(records)+6)//7)*178),'#edf3f7');draw=ImageDraw.Draw(preview)
        for index,row in enumerate(records):
            thumb=Image.open(output/'icons'/row['target']).convert('RGBA');thumb.thumbnail((158,140),Image.Resampling.LANCZOS)
            x=index%7*174;y=index//7*178;preview.paste(thumb,(x+(174-thumb.width)//2,y+4+(140-thumb.height)//2),thumb)
            draw.text((x+3,y+148),row['id'][:25],fill='#16334b')
        preview.save(output/f'{sheet}-review.png')
    print(json.dumps(dict(output=str(output),icons=259,individually_edited=len(edits),protected_subject_pixels_removed=0)))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--baseline',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();refine(args.baseline,args.output)
