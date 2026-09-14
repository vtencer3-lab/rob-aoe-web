import struct, sys
bnk=sys.argv[1]; want={int(x) for x in sys.argv[2:]}
d=open(bnk,'rb').read(); o=0; secs={}
while o+8<=len(d):
    tag=d[o:o+4]; ln=struct.unpack_from('<I',d,o+4)[0]; secs[tag]=(o+8,ln); o+=8+ln
do,dl=secs[b'DIDX']; data_off=secs[b'DATA'][0]
for i in range(dl//12):
    wid,off,size=struct.unpack_from('<III',d,do+i*12)
    if wid in want:
        out=f'{wid}.wem'; open(out,'wb').write(d[data_off+off:data_off+off+size]); print('wrote',out,size,'bytes')
