var start_pos: usize = 0;
var pos: usize = 0;
var end: usize = 0;
var text: [*]allowzero u8 = @ptrFromInt(0);
var text_len: usize = 0;

export fn init_scanner(text_length: usize) u32 {
    start_pos = 0;
    pos = 0;
    end = 0;
    text = @ptrFromInt(0);
    text_len = text_length;
    return 3;
}

export fn scan_token() void {
    // TODO
}
