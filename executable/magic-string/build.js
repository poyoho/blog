const fs = require('fs')
const MagicString = require('magic-string')
const concat = require('concat-stream')
const vlq = require('vlq')

process.chdir( __dirname );
	
const formatMappings = (mappings, sources, names) => {
	const vlqState = [ 0, 0, 0, 0, 0 ]
	return mappings.split(';').reduce((accum, line, i) => {
	accum[i + 1] = formatLine(line, vlqState, sources, names)
	vlqState[0] = 0
	return accum
	}, {})
}

const formatLine = (line, state, sources, names) => {
	const segs = line.split(',')
	return segs.map(seg => {
	if (!seg) return ''
	const decoded = vlq.decode(seg)
	for (var i = 0; i < 5; i++) {
		state[i] = typeof decoded[i] === 'number' ? state[i] + decoded[i] : state[i]
	}
	return formatSegment(...state.concat([ sources, names ]))
	})
}

const formatSegment = (col, source, sourceLine, sourceCol, name, sources, names) =>
	`${col + 1} => ${sources[source]} ${sourceLine + 1}:${sourceCol + 1}${names[name] ? ` ${names[name]}` : ``}`

const result = fs.readFileSync( '../../example/magic-string/app.source.js', 'utf-8')
let source,
	magicString,
	pattern = /foo/g,
	match,
	transpiled,
	map;

source = result.toString();
magicString = new MagicString( result.toString() );

while (match = pattern.exec(source)) {
	magicString.overwrite( match.index, match.index + 3, 'answer', true);
}

const linePattern = /\n/g
while (match = linePattern.exec(source)) {
	magicString.overwrite( match.index, match.index + 1, '', true);
}

const idx = source.indexOf('yes')
magicString.overwrite(idx, idx + 3, 'no', true)

transpiled = magicString.toString() + '\n//# sourceMappingURL=app.js.map';
map = magicString.generateMap({
	file: 'app.js.map',
	source: 'app.source.js',
	includeContent: true,
	hires: true
});

const dump = JSON.stringify({
	...map,
	mappings: formatMappings(map.mappings, map.sources, map.names)
}, null, 2)


fs.writeFileSync( '../../example/magic-string/app.js', transpiled );
fs.writeFileSync( '../../example/magic-string/app.js.map', JSON.stringify(map) );

fs.writeFileSync( '../../example/magic-string/app.inlinemap.js', transpiled + '\n//#sourceMappingURL=' + map.toUrl() );
fs.writeFileSync('../../example/magic-string/app.js.mappings.json', dump)
