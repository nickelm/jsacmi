// trackio.js -- separate I/O library for node (not browsers).

const fs = require('fs');
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
        var fields = tokenizeUpdate(str);
        var objId = parseInt(fields[0], 16);

        // Initialize the object if needed
        if (objId in context.db.data == false) {
            context.db.data[objId] = jsacmi.TrackObject.createObject(context.currOffset);
        }

        // Remove the first element
        fields.shift();

        // Iterate through the fields
        for (const elem of fields) {

            // Parse the variable and value
            var data = elem.match(/([^=]+)=(.*)/);
            var name = data[1];
            var value = data[2];

            // Is this a time reference?
            if (name === "ReferenceTime" || name === "RecordingTime") {
                value = new Date(value);
            }
            // Is it a positional indicator?
            else if (name === "T") {
                value = parseObjectCoords(value);
            }

            // Is there an entry already for this time in this object?
            var timeEntry = context.db.data[objId].vals[context.db.data[objId].vals.length - 1];
            if (timeEntry === undefined || timeEntry['_time'] !== context.currOffset) {
                timeEntry = jsacmi.TrackObject.createEntry(context.currOffset);
                jsacmi.TrackObject.addEntry(context.db.data[objId], timeEntry);
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
            db:  new jsacmi.TrackDatabase(),
            currOffset: 0.0
        }

        // Create the read interface
        const fileStream = fs.createReadStream(trackFile);    
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        var lineBuffer = "";

        // Step through one line at a time
        for await (const line of rl) {

            // Empty line?
            if (line.length == 0) continue;

            // Skip the file format header
            // FIXME: Check the file format
            if (line === "FileType=text/acmi/tacview" || line.startsWith("FileVersion")) continue;

            // Detect escaped newlines and accumulate the line, then go around
            if (line[line.length - 1] === '\\') {
                lineBuffer = lineBuffer.concat(line.substr(0, line.length - 1));
                continue;
            }

            // No escaped newline, let's make sure we add any previous lines
            lineBuffer = lineBuffer.concat(line);

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
}

module.exports = TrackIO;
