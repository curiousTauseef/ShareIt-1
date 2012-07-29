var fid = 0;

var socket = io.connect('http://localhost:8000');

var chunksize = 65536;

socket.on('connect', function(data)
{
	onopen();

	socket.emit('joiner', $.url().segment(1));	
});

socket.on('warn', function(data)
{
	warn(data);
});

socket.on('info', function(data)
{
	info(data);
});

function encode64(input)
{
	var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "abcdefghijklmnopqrstuvwxyz" + "0123456789+/" + "=";

	var output = "";
    var chr1, chr2, chr3 = "";
    var enc1, enc2, enc3, enc4 = "";
    var i = 0;

    do
    {
    	chr1 = input.charCodeAt(i++);
        chr2 = input.charCodeAt(i++);
        chr3 = input.charCodeAt(i++);

        enc1 = chr1 >> 2;
        enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        enc4 = chr3 & 63;

        if(isNaN(chr2))
            enc3 = enc4 = 64;
        else if(isNaN(chr3))
            enc4 = 64;

        output = output +
            keyStr.charAt(enc1) +
            keyStr.charAt(enc2) +
            keyStr.charAt(enc3) +
            keyStr.charAt(enc4);
        chr1 = chr2 = chr3 = "";
    	enc1 = enc2 = enc3 = enc4 = "";
	} while(i < input.length);

	return output;
}