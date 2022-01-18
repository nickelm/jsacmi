// trackio.js -- separate I/O library for node (not browsers).

const fs = require('fs');
const os = require("os");
const readline = require('readline');

const jsacmi = require('./jsacmi');

function startsWithObjectId(str) {
    var objId = /^[0-9A-Fa-f]+/;
    return str.match(objId) != null;
}    

function tokenizeUpdate(str) {
    return str.match(/((\\,)|[^,])+/gi);
}

function parseTimeOffset(str) {
    var timeOffset = /#(\d+\.?\d*)/;
    return parseFloat(str.match(timeOffset)[1]);
}

function parseObjectCoords(str) {
    var fields = str.split(/\|/); 
    if (fields === null) return null;
    for (var i = 0; i < fields.length; i++) {
        fields[i] = parseFloat(fields[i]);
    }
    if ([3, 5, 9].includes(fields.length)) return fields;
    return null;
}

class TrackIO {

    static parseUpdate(context, str) {

        // Parse the fields
        let fields = tokenizeUpdate(str);
        let objId = parseInt(fields[0], 16);

        // Initialize the object if needed
        if (objId in context.db.data == false) {
            context.db.data[objId] = jsacmi.TrackObject.createObject(context.currOffset);
        }

        // Remove the first element
        fields.shift();

        // Create an entry
        let timeEntry = jsacmi.TrackObject.createEntry(context.currOffset);
        jsacmi.TrackObject.addEntry(context.db.data[objId], timeEntry);

        // Iterate through the fields
        for (const elem of fields) {

            // Parse the variable and value
            let data = elem.match(/([^=]+)=(.*)/);
            let name = data[1];
            let value = data[2];

            // Is it a positional indicator?
            if (name === "T") {
                value = parseObjectCoords(value);
            }

            // Sanity check
            if (value === null) continue;

            // Now add the data to the current time entry
            timeEntry[name] = value;
        }
    }

    static parseRemove(context, line) {

        // Parse the object identifier (negate the number)
        var objId = -parseInt(line, 16);

        // Sanity check
        if (objId in context.db.data == false) {
            console.log("ERROR: removing an object (" + objectId + ") that does not exist.");
            return;
        }

        // Mark it as deleted at this point in time
        context.db.data[objId].end = context.currOffset;
    }

	static async loadACMI(trackFile) {
        
        // Create the new context 
        var context = {
            db: new jsacmi.TrackDatabase(),
            currOffset: 0.0
        }

        // Create the read interface
        const fileStream = fs.createReadStream(trackFile);    
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        var lineBuffer = "";

        // Step through one line at a time
        for await (let line of rl) {

            // Trim the line
            line = line.trim();

            console.log(trackFile + " - " + line);

            // Empty line?
            if (line.length == 0) continue;

            // Skip the file format header
            // FIXME: Check the file format
            if (line === "FileType=text/acmi/tacview" || line.startsWith("FileVersion")) continue;

            // Make sure we add any previous lines
            lineBuffer = lineBuffer.concat(line);

            // Detect escaped newlines and go around
            if (line[line.length - 1] === '\\') {
                continue;
            }

            // Comment?
            if (lineBuffer.substr(0, 2) == "//") continue;

            // All right, frame specification?
            if (lineBuffer[0] == '#') {
        
                // Parse the offset (number of seconds since the reference time)
                context.currOffset = parseTimeOffset(lineBuffer);
            }
            // Object remove?
            else if (lineBuffer[0] == '-') {

                // Handle it
                TrackIO.parseRemove(context, lineBuffer);
            }
            // No, must be an object update
            else if (startsWithObjectId(lineBuffer)) {
            
                // Parse the update
                TrackIO.parseUpdate(context, lineBuffer);
            }

            // Clear the line
            lineBuffer = "";
        }

        return context.db;
    }

    static async saveACMI(trackFile, db) {
    
        // Concatenate each of the object data into a master list (sorting is said to be faster than merging)
        let allData = [];
        for (let id in db.data) {

            // Add these events
            let obj = db.data[id];
            if (obj.vals === null) continue;
            allData = allData.concat(obj.vals.map(e => { e['_id'] = id; return e; }));
            
            // Need to add a delete event if the element is destroyed
            if (obj.end !== null) {
                let remove = jsacmi.TrackObject.createEntry(parseFloat(obj.end));
                remove['_id'] = id;
                remove['_rm'] = true;
                allData.push(remove);
            }
        }

        // Now sort the data
        allData.sort((a, b) => a['#'] - b['#']);

        // Open a new file
        const fileStream = fs.createWriteStream(trackFile); 

        // Write the required header
        fileStream.write('FileType=text/acmi/tacview' + os.EOL + 'FileVersion=2.2' + os.EOL);

        // Write line by line
        let currOffset = 0.0; 
        for (let i = 0; i < allData.length; i++) {

            // Isolate the line
            let curr = allData[i];

            // Do we need to output a new time marker?
            if (currOffset != curr['#']) {
                currOffset = curr['#'];
                fileStream.write('#' + currOffset + os.EOL);
            }

            // Isolate the object identifier
            let id = parseInt(curr['_id']);

            // Is this a remove command?
            if (curr.hasOwnProperty('_rm')) {
               fileStream.write('-' + id.toString(16) + os.EOL);
               continue;
            }
            
            // Now write the identifier first
            fileStream.write(id.toString(16));

            // Iterate through the fields
            for (const name in curr) {

                // Skip the fields we have already dealt with
                if (name === '#' || name.startsWith('_')) continue;

                // Write the starting comma
                fileStream.write(',');

                // Is this a coordinate command?
                if (name === 'T') {
                    let first = true;
                    for (let coord of curr['T']) {
                        let delim = '|';
                        let val = coord === null || isNaN(coord) ? '' : coord.toString();
                        if (first) {
                            delim = 'T=';
                            first = false;
                        }
                        fileStream.write(delim + val);
                    }
                }
                // Nope, it's just a normal data value
                else {
                    fileStream.write(name + '=');
                    var lines = curr[name].toString().split(/\\(?!,)/);
                    for (let ndx = 0; ndx < lines.length; ndx++) {
                        if (ndx > 0) fileStream.write('\\' + os.EOL);
                        fileStream.write(lines[ndx]);
                    }
                }
            }
            
            // End the line
            fileStream.write(os.EOL);                
        }
    }
}

module.exports = TrackIO;
