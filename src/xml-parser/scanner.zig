const std = @import("std");

var start_pos: usize = 0;
var token_value_start: usize = 0;
var token_value_end: usize = 0;
var pos: usize = 0;
var end: usize = 0;
var token: u8 = 255;

var in_tag: bool = false;

var text: [*]allowzero u8 = @ptrFromInt(0);
var text_len: usize = 0;

export fn init_scanner(text_length: usize) u32 {
    start_pos = 0;
    token_value_start = 0;
    token_value_end = 0;
    pos = 0;
    end = 0;
    token = 0;
    in_tag = false;
    text = @ptrFromInt(0);
    text_len = text_length;
    return 3;
}

const TokenKind = struct {
    pub const eof: u8 = 0;
    pub const startTag: u8 = 1; // <
    pub const endTag: u8 = 2; // >
    pub const startClosingTag: u8 = 3; // </
    pub const endSelfClosing: u8 = 4; // />
    pub const identifier: u8 = 5;
    pub const textNode: u8 = 6;

    pub const UnterminatedTextNode: u8 = 64;
    pub const UnterminatedQuote: u8 = 65;
    pub const UnterminatedPreamble: u8 = 66;
    pub const EqualsWithoutIdentifier: u8 = 67;
    pub const DoubleQuoteWithoutEquals: u8 = 68;
};

const CharCode = struct {
    pub const lineFeed: u8 = '\n';
    pub const carriageReturn: u8 = '\r';
    pub const space: u8 = ' ';
    pub const tab: u8 = '\t';
    pub const lessThan: u8 = '<';
    pub const greaterThan: u8 = '>';
    pub const slash: u8 = '/';
    pub const equals: u8 = '=';
    pub const doubleQuote: u8 = '"';
    pub const questionMark: u8 = '?';
    // weitere falls benötigt …
};

export fn scan_token() u8 {
    token_value_start = pos;

    while (true) {
        if (pos >= end) {
            token = TokenKind.eof;
            return token;
        }

        const ch = text[pos];
        switch (ch) {
            CharCode.lineFeed, CharCode.carriageReturn, CharCode.space, CharCode.tab => {
                pos += 1;
                continue;
            },

            CharCode.equals => {
                if (in_tag) {
                    return 1; // TODO
                }
                return scan_text_node();
            },

            CharCode.lessThan => {
                pos += 1;
                in_tag = true;

                if (pos < end) {
                    switch (text[pos]) {
                        CharCode.slash => {
                            pos += 1;
                            token = TokenKind.startClosingTag;
                            return token;
                        },
                        CharCode.questionMark => {
                            in_tag = false;
                            const e = skip_preamble();
                            if (e != 0) {
                                return e;
                            }
                            continue;
                        },
                        else => {},
                    }
                }

                token = TokenKind.startTag;
                return token;
            },

            CharCode.greaterThan => {
                pos += 1;
                in_tag = false;
                token = TokenKind.endTag;
                return token;
            },

            CharCode.slash => {
                if (!in_tag) {
                    return scan_text_node();
                }

                pos += 1;

                if (pos < end and text[pos] == CharCode.greaterThan) {
                    pos += 1;
                    token = TokenKind.endSelfClosing;
                    return token;
                }

                token = TokenKind.endTag;
                return token;
            },

            CharCode.doubleQuote => {
                if (in_tag) {
                    return TokenKind.DoubleQuoteWithoutEquals;
                }
                return scan_text_node();
            },

            // default
            else => {
                if (!in_tag) {
                    return scan_text_node();
                }

                if (is_identifier_start(ch)) {
                    const tk = scan_identifier();

                    if (pos < end and text[pos] == CharCode.equals) {
                        pos += 1;

                        if (pos >= end or text[pos] != CharCode.doubleQuote)
                            return TokenKind.DoubleQuoteWithoutEquals;

                        const err = skip_quoted_string();
                        if (err != 0) {
                            return err;
                        }
                        continue;
                    }

                    return tk;
                }

                // sonst einfach ignorieren
                pos += 1;
                continue;
            },
        }
    }
}

fn scan_identifier() u8 {
    const start = pos;
    skip_identifier();
    token_value_start = start;
    token_value_end = pos;

    token = TokenKind.identifier;
    return token;
}
fn scan_text_node() u8 {
    var start = pos;

    while (start < end and is_whitespace(text[start])) {
        start += 1;
    }

    const idx = index_of(text, "<"[0], start + 1);
    if (idx == null) {
        return TokenKind.UnterminatedTextNode;
    }

    pos = idx.?;
    var endPos = pos;

    while (endPos > start and is_whitespace(text[endPos - 1])) {
        endPos -= 1;
    }

    token_value_start = start;
    token_value_end = endPos;

    token = TokenKind.textNode;
    return token;
}

fn skip_identifier() void {
    pos += 1;
    while (pos < end and is_identifier_part(text[pos])) {
        pos += 1;
    }
}

fn skip_preamble() u8 {
    pos += 1; // consume '?'

    const closeIdx = index_of(text, CharCode.greaterThan, pos);
    if (closeIdx == null) return TokenKind.UnterminatedPreamble;

    const qmPos = closeIdx.? - 1;
    if (qmPos >= text_len or text[qmPos] != CharCode.questionMark)
        return TokenKind.UnterminatedPreamble;

    pos = closeIdx.? + 1;
    return 0;
}

fn skip_quoted_string() u8 {
    pos += 1; // opening "

    const idx = index_of(text, CharCode.doubleQuote, pos);
    if (idx == null) return TokenKind.UnterminatedQuote;

    pos = idx.? + 1; // consume closing "
    return 0;
}

fn is_identifier_start(c: u8) bool {
    return std.ascii.isAlphabetic(c) or c == '_' or c == ':';
}
fn is_identifier_part(c: u8) bool {
    return std.ascii.isAlphanumeric(c) or c == '_' or c == '-' or c == ':';
}
fn index_of(haystack: [*]allowzero const u8, needle: u8, start: usize) ?usize {
    var i = start;
    while (i < text_len) : (i += 1) {
        if (haystack[i] == needle) return i;
    }
    return null;
}
fn is_whitespace(c: u8) bool {
    return c == CharCode.space or c == CharCode.tab or c == CharCode.lineFeed;
}
