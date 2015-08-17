var _ = require('lodash');
var normalizer = require('./normalizer');

var typeMappings = [
  {
    match: /long/i,
    attr: 'float'
  },
  {
    match: /boolean/i,
    attr: 'boolean'
  },
  {
    match: /tint/i,
    attr: 'integer'
  },
  {
    match: /(text_.*|string)/i,
    attr: 'string'
  }
];

function checkField (type) {
  var match = _.find(typeMappings, function(mapping) {
    return mapping.match.test(type);
  });
  return match ? match.attr : null;
};

function getNames (name, schema) {
  var searchField = name.match(/.*(_search)$/);
  var exactField = name.match(/.*(_exact)$/);
  var rootName = name.replace(/_search|_exact/ig,'');
  if (!schema[rootName]) schema[rootName] = {};

  if (searchField) schema[rootName].searchField = searchField[0];
  if (exactField) schema[rootName].exactField = exactField[0];
  return schema[rootName];
};

module.exports = (function() {
  var solrFieldsHelper = {

    mapSchema: function(fields, newSchema) {
      /**
       * Map the fields from a Solr schema to a Waterline compatible schema
       * @param {Object} schema Solr Schema as found at /schema
       */

      fields.forEach(function(field) {
        if (newSchema[field]) return;

        var type = field.multiValued ? 'array' : checkField(field.type);
        if (!type) return;
        
        var newField = getNames(field.name, newSchema);
        newField.type = type;
      })
      return newSchema;

    },

    /**
     *
     * Map regular field names to their Solrized versions
     *
     * @param  {Object}     doc         [Solr document]
     * @param  {Object}     collection  [Sails model]
     * @return {}                       [none]
     */
    mapFieldNames: function(doc, collection) {

      for(var prop in collection.solrConfig.fieldMapping) {
        var sailsFieldName  = prop;
        var solrFieldName   = this.getSolrFieldName(sailsFieldName, collection);

        if(typeof(solrFieldName) != 'undefined') {
          doc[solrFieldName] = doc[sailsFieldName];
          delete doc[sailsFieldName];
        }
      }
    },


    wrapValue: function(value) {
      /**
       * @param {String} name A value for a query
       * @return {String} A cleaned value
       */
      value = normalizer.escapeColonChars(value);
      return value.indexOf(' ') > -1 ? ('"' + value + '"') : value;

    },

    /**
     *
     * Map a field name to their Solrized versions
     *
     * @param  {String}     fieldName   [field name]
     * @param  {Object}     collection  [Sails model]
     * @return {}                       [none]
     */
    getSolrFieldName: function(sailsFieldName, collection, exact) {

      var attr = collection.attributes[sailsFieldName];
      if (!attr) return sailsFieldName;

      if (exact) return attr['exactField'] || sailsFieldName;
      return attr['searchField'] || sailsFieldName;
    },

    /**
     *
     * Map Solr field names back to the Sails names
     *
     * @param  {Object}     doc         [Solr document]
     * @param  {Object}     collection  [Sails model]
     * @return {}                       [none]
     */
    unmapFieldNames: function(doc, collection) {
      for(var prop in collection.solrConfig.fieldMapping) {
        var sailsFieldName  = prop;
        var solrFieldName   = this.getSolrFieldName(sailsFieldName, collection);

        if(typeof(solrFieldName) != 'undefined') {
          doc[sailsFieldName] = doc[solrFieldName];
          delete doc[solrFieldName];
        }
      }
    }
  };

  return solrFieldsHelper;
})();