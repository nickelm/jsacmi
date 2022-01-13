// jsacmi.js - JavaScript module for loading, saving, and managing Tacview ACMI files.

const fs = require('fs');
const readline = require('readline');

// -- Internal helper functions
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

function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

// -- Classes (exported)
class TrackObject {
    
    constructor(id, data) {
        this.id = id;
        this.data = data;
    }

    findNearestValueIndex(comp, index, delta) {

        // Initialize at the current position
        var currEntry = this.data.vals[index];

        // Keep stepping back until we find it
        while (comp(currEntry) == false) {
            index += delta;
            if (index < 0 || index >= this.data.vals.length) return -1;
            currEntry = this.data.vals[index];
        }
        
        // We found it, so return the index
        return index;
    }

    findNearestValue(comp, index, delta) {
        var ndx = this.findNearestValueIndex(comp, index, delta);
        if (ndx === -1) return null;
        return this.data.vals[ndx];
    }

    findFirstValue(comp) {
        return this.findNearestValue(e, 0, 1);
    }

    findLastValue(comp) {
        return this.findNearestValue(comp, this.data.vals.length - 1, -1);
    }

    binTimeSearch(time, ndx1, ndx2) {
        
        // Retrieve the middle two values
        var mid = Math.floor((ndx1 + ndx2) / 2);
        var t1 = this.data.vals[mid]['_time'];
        var t2 = this.data.vals[mid + 1]['_time'];

        // Base case: our value is in between
        if (time >= t1 && time <= t2) return mid;

        // Recursive case: we go left or right
        if (time < t1) return this.binTimeSearch(time, ndx1, mid);
        else return this.binTimeSearch(time, mid + 1, ndx2);
    }

    findTimeIndex(time) {

        // Sanity check
        if (time <= this.data.vals[0]['_time']) return 0;
        if (time >= this.data.vals[this.data.vals.length - 1]['_time']) return this.data.vals.length - 1;
        
        // Binary search
        return this.binTimeSearch(time, 0, this.data.vals.length - 1);
    }
 
    findValueAtTime(comp, retrieve, time) {
       
        // First look up the time index
        var startIndex = this.findTimeIndex(time);

        // Sanity check: before and after the time limits?
        if (startIndex <= 0) return retrieve(this.findFirstValue(comp));
        if (startIndex >= this.data.vals.length - 1) return retrieve(this.findLastValue(comp));

        // Now we need to search for the value before and after this index
        var prevIndex = this.findNearestValueIndex(comp, startIndex, -1);
        var nextIndex = this.findNearestValueIndex(comp, startIndex + 1, 1);

        // FIXME: Handle edge cases (index = -1)

        // Calculate the time difference and interpolate
        var prevTime = this.data.vals[prevIndex]['_time']; 
        var nextTime = this.data.vals[nextIndex]['_time'];
        var timeDelta = nextTime - prevTime;
        var prevValue = retrieve(this.data.vals[prevIndex]);
        var nextValue = retrieve(this.data.vals[nextIndex]);
        return lerp(prevValue, nextValue, (time - prevTime) / timeDelta);
    }

    getValueAtTime(name, time) {
        return this.findValueAtTime((e) => name in e, (e) => e[name], time);
    }
   
    getStringAtTime() {

    }

    getCoordAtTime(coord, time) {
        return this.findValueAtTime((e) => 'T' in e && e['T'].length > coord && e['T'][coord] != null, (e) => e['T'][coord], time);
    }
    
    static createObject(time) {
        return { start: time, end: null, vals: [] };
    }

    static createEntry(time) {
        return { "_time": parseFloat(time) };
    }

    static addEntry(data, entry) {
        data.vals.push(entry);
    }

    static getLatestEntry(data) {
        return data.vals[data.vals.length - 1];
    }
}

 class TrackDatabase {

    constructor(data = null) {
        this.data = data != null ? data : {};
        if (0 in this.data) {
            this.global = this.data[0];
        }
        else {
            this.global = TrackObject.createObject(0.0);
            this.data[0] = this.global;
        }
        this.referenceTime = null;
        this.currOffset = 0.0;
    }

    parseUpdate(str) {

        // Parse the fields
        var fields = tokenizeUpdate(str);
        var objId = parseInt(fields[0], 16);

        // Initialize the object if needed
        if (objId in this.data == false) {
            this.data[objId] = TrackObject.createObject(this.currOffset);
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
            var timeEntry = TrackObject.getLatestEntry(this.data[objId]);
            if (timeEntry === undefined || timeEntry['_time'] !== this.currOffset) {
                timeEntry = TrackObject.createEntry(this.currOffset);
                TrackObject.addEntry(this.data[objId], timeEntry);
            }

            // Sanity check
            if (value === null) continue;

            // Now add the data to the current time entry
            timeEntry[name] = value;
        }
    }

    parseRemove(line) {

        // Parse the object identifier (negate the number)
        var objId = -parseInt(line, 16);

        // Sanity check
        if (objId in this.data == false) {
            console.log("ERROR: removing an object (" + objectId + ") that does not exist.");
            return;
        }

        // Mark it as deleted at this point in time
        this.data[objId].end = this.currOffset;
    }

    async loadACMI(trackFile) {

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
                this.currOffset = parseTimeOffset(lineBuffer);
            }
            // Object remove?
            else if (lineBuffer[0] == '-') {

                // Handle it
                this.parseRemove(lineBuffer);
            }
            // No, must be an object update
            else if (startsWithObjectId(lineBuffer)) {
            
                // Parse the update
                this.parseUpdate(lineBuffer);
            }

            // Clear the line
            lineBuffer = "";
        }
    }
}

// EXPORTS
exports.TrackDatabase = TrackDatabase;
exports.TrackObject = TrackObject;
