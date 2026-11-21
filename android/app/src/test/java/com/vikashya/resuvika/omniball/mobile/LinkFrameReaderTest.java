package com.vikashya.resuvika.omniball.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class LinkFrameReaderTest {
    @Test public void preservesSplitUnicodeAndMultipleFrames() throws Exception {
        byte[] bytes="\n{\"note\":\"नमस्ते 世界\"}\n{\"type\":\"end\"}\n".getBytes(StandardCharsets.UTF_8);
        ByteArrayInputStream fragmented=new ByteArrayInputStream(bytes){@Override public synchronized int read(byte[] b,int off,int len){return super.read(b,off,Math.min(len,2));}};
        LinkFrameReader reader=new LinkFrameReader(fragmented);
        assertEquals("{\"note\":\"नमस्ते 世界\"}",reader.next());assertEquals("{\"type\":\"end\"}",reader.next());assertNull(reader.next());
    }
    @Test public void rejectsTruncatedOrOversizedFrames() throws Exception {
        try{new LinkFrameReader(new ByteArrayInputStream("partial".getBytes(StandardCharsets.UTF_8))).next();fail("Incomplete frame accepted");}catch(IOException expected){}
        try{new LinkFrameReader(new ByteArrayInputStream(new byte[65537])).next();fail("Oversized frame accepted");}catch(IOException expected){}
    }
    @Test public void acceptsFrameExactlyAtLimit() throws Exception {
        byte[] bytes=new byte[65537];java.util.Arrays.fill(bytes,(byte)'a');bytes[65536]=10;
        assertEquals(65536,new LinkFrameReader(new ByteArrayInputStream(bytes)).next().length());
    }
}
