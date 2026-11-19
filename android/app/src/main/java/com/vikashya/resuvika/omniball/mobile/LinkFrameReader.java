package com.vikashya.resuvika.omniball.mobile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Bounded newline framing, independent of Bluetooth packet and UTF-8 character boundaries. */
final class LinkFrameReader {
    private final InputStream stream;
    private final byte[] block=new byte[4096];
    private int cursor=0,count=0;
    LinkFrameReader(InputStream stream){this.stream=stream;}
    String next() throws IOException {
        ByteArrayOutputStream frame=new ByteArrayOutputStream();
        while(true){
            if(cursor==count){count=stream.read(block);cursor=0;if(count==-1){if(frame.size()!=0)throw new IOException("Incomplete device message");return null;}}
            byte value=block[cursor++];
            if(value==10){if(frame.size()==0)continue;return new String(frame.toByteArray(),StandardCharsets.UTF_8);}
            if(frame.size()>=65536)throw new IOException("Device message exceeds 64 KiB");
            frame.write(value);
        }
    }
}
