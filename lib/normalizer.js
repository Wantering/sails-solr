// Hello
var columnTypes = null;

function getColumnType(columnName, collection) {
  if(columnTypes == null) {
    buildColumnTypes(collection);
  }

  return columnTypes[columnName]; 
}

function buildColumnTypes(collection) {
  var field;
  columnTypes = {};
  
  for(var fieldName in collection._attributes) {
    field = collection._attributes[fieldName];
    columnTypes[field.columnName] = field.type;
  }
}

module.exports = {
  solrNormalize: function(columnName, collection, value) {
    var normalized;
    var columnType = getColumnType(columnName, collection);
    switch(columnType) {
      case 'datetime':
        // Add trailing Z required by Solr
        normalized = (value.substr(-1) == 'Z') ? value : value + 'Z';
        
        // Escape colon characters
        normalized = this.escapeColonChars(normalized);

        return normalized;
        break;
      default:
        return value;
    }
  },
  escapeColonChars: function(subject) {
    var pattern = /:/g
    var escaped = subject.replace(pattern, "\\:");

    return escaped;
  }
  
  // TODO: hasn't been tested or used
  // sailsNormalize: function(fieldType, value) {
  //   var columnType = getColumnType(columnName, collection);
  //   
  //   switch(fieldType) {
  //     case 'datetime':
  //       // Remove the trailing Z from Solr datetime format
  //       return value.substring(0, value.length-1);
  //       break;
  //     default:
  //       return value;
  //   }
  // }
}
