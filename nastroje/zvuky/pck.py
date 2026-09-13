import struct, sys, os
def parse(path):
    f=open(path,'rb')
    magic=f.read(4); assert magic==b'AKPK', magic
    hsize,ver=struct.unpack('<II',f.read(8))
    lang_len,bnk_len,stm_len=struct.unpack('<III',f.read(12))
    # some versions have a 4th table (externals)
    pos=f.tell()
    hdr=f.read(hsize-(pos-8)) if hsize>0 else b''
    # rebuild: header starts after hsize field? hsize counts bytes after the size field
    f.seek(8)
    data=f.read(hsize)
    ver=struct.unpack_from('<I',data,0)[0]
    o=4
    lang_len,bnk_len,stm_len=struct.unpack_from('<III',data,o); o+=12
    ext_len=None
    # heuristic: if there's an externals table, sizes sum + 16 == hsize-4
    if 4+12+lang_len+bnk_len+stm_len < len(data):
        ext_len=struct.unpack_from('<I',data,o)[0]; o+=4
    langs={}
    lo=o; n=struct.unpack_from('<I',data,lo)[0]
    for i in range(n):
        off,lid=struct.unpack_from('<II',data,lo+4+i*8)
        s=data[lo+off:].split(b'\0\0',1)[0]
        try: name=s.decode('utf-16-le')
        except: name=str(s)
        langs[lid]=name
    o+=lang_len
    def table(o):
        n=struct.unpack_from('<I',data,o)[0]; items=[]
        for i in range(n):
            fid,bs,fs,offb,lid=struct.unpack_from('<IIIII',data,o+4+i*20)
            items.append((fid,bs,fs,offb*bs,lid))
        return items
    banks=table(o); o+=bnk_len
    streams=table(o); o+=stm_len
    ext=table(o) if ext_len else []
    return f,ver,langs,banks,streams,ext
if __name__=='__main__':
    f,ver,langs,banks,streams,ext=parse(sys.argv[1])
    print('ver',ver,'langs',langs,'banks',len(banks),'streams',len(streams),'ext',len(ext))
    for b in banks: print('BNK',b)
    print('first streams',streams[:5])
