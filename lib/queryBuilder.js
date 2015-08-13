// TODO: code review and clean unused files
// var SolrFieldsHelper  = require('./solrFieldsHelper');
var normalizer        = require('./normalizer');
var solrFieldsHelper = require('./solrFieldsHelper');
var _ = require('lodash');

module.exports = (function() {
  var queryBuilder = {
    /**
     *
     * This method receives an object with options following
     * the Waterline Query Language, and uses them to build
     * a solr-client query.
     *
     * @param  {Object}   options     [Waterline Query Language-formatted options]
     * @param  {Query}    query       [solr-client Query]
     * @param  {Object}   collection  [Sails model]
     */
    buildFiltersFromWaterlineOptions: function(options, query) {
      var prop,
          queryFragments,
          fieldName,
          fieldQuery,
          i,
          collection;
      
      collection = query.model;

      for(prop in options) {
        this.addFilterProperty(prop, options[prop], query, collection);
      }
    },

    /**
     *
     * Does most of the work for buildFiltersFromWaterlineOptions, adding
     * each of the filtering criteria to the query
     *
     * @param  {String} prop            [key of the property to add]
     * @param  {Object} propCriteria    [value of the criteria to be added]
     * @param  {Object} query           [solr-client Query object]
     */
    addFilterProperty: function(prop, propCriteria, query, collection) {
      var rawParameters,
          queryFragments = [],
          sortCriteria,
          schema = collection.attributes,
          solrFieldName;

      switch(prop) {
        case 'limit':
          query.rows(propCriteria);
          break;
        case 'skip':
          query.start(propCriteria);
          break;
        case 'sort':
          sortCriteria = {}
          for(sortField in propCriteria) {
            solrFieldName               = solrFieldsHelper.getSolrFieldName(sortField, collection, true);
            sortCriteria[solrFieldName] = (propCriteria[solrFieldName] == 1) ? 'asc' : 'desc';
          }
          query.sort(sortCriteria);
          break;
        case 'query':
          rawParameters = propCriteria;
          break;

        case 'select':
          query.restrict(propCriteria);
          break;
        
        case 'where':
          for(fieldName in propCriteria) {
            solrFieldName = solrFieldsHelper.getSolrFieldName(fieldName, collection, true);
            this.addFilterProperty(fieldName, propCriteria[fieldName], query, collection);
            
            // fieldQuery = this.getSolrFieldFilter(fieldName, propCriteria[fieldName]);
            // queryFragments.push({
            //   fieldName: fieldName,
            //   fieldQuery: fieldQuery
            // });
          }
          break;
        case 'or':
          fieldQuery = this.getSolrFieldFilter(prop, propCriteria, collection);
          queryFragments.push({
            fieldName: null,
            fieldQuery: fieldQuery
          });
          break;
        case 'facet':
          query.facet(propCriteria);
          break;
        case 'rawResponse':
          query.returnRawResponse = true;
          break;
        default:
          fieldQuery = this.getSolrFieldFilter(prop, propCriteria, collection);
          queryFragments.push({
            fieldName: prop,
            fieldQuery: fieldQuery
          });
      }

      // Add the query fragments produced in the where and default
      // cases to the query.
      queryFragments.forEach(function(value) {
        query.matchFilter(value.fieldName, value.fieldQuery);
      });

      if(rawParameters) {
        query.set(rawParameters);
      }
      
      if(!query.hasWildcardQuery) {
        query.q('*:*'); 
        query.hasWildcardQuery = true;
      }
    },

    /**
     *
     * Builds a Solr query string from a set of Waterline options
     * omits the q= part.
     *
     * @param  {Object}   options     [Waterline Query Language-formatted options]
     * @param  {Query}    query       [solr-client Query]
     * @return {String}               [Solr query string, without leading q=]
     */
    buildSimpleQueryFromWaterlineOptions: function(options, query, operator) {
      var fields      = {};
      var collection  = query.model;

      for(prop in options) {
        switch(prop) {
          case 'where':
            for(fieldName in options[prop]) {
              fields[fieldName] = this.getSolrFieldFilter(fieldName, options[prop][fieldName], collection);
            }
            break;
          default:
            fields[prop] = this.getSolrFieldFilter(prop, propCriteria, collection);
        }
      }

      return query.queryObjectToString(fields, operator, true);
    },


    /**
     *
     * Generates a query for Solr, filtering by a document field,
     * from waterline field criteria
     *
     * for example, if the criteria is 
     * 
     *       { '!': ['One', 'Two']}
     *
     * and the field name is numbers
     * the output string should be something like:
     *
     *       -numbers:(One Two)
     *
     * @param  {string}         fieldName        [document field name]
     * @param  {string|object}  fieldCriteria    [string value to match or object with filtering criteria]
     * @return {string}                          [returns true on success, false on error]
     */
    getSolrFieldFilter: function(fieldName, fieldCriteria, collection) {
      var criteriaType  = this.getCriteriaType(fieldName, fieldCriteria);
      
      // Normalize filter value
      fieldCriteria = normalizer.solrNormalize(fieldName, collection, fieldCriteria);

      switch(criteriaType) {
        case 'match value':
          return '(' + fieldCriteria + ')';
        case 'IN':
          return '(' + fieldCriteria.join(' ') + ')';
        case 'OR':
          var fields = [];
          var adapter = this;

          function processFilter(orFieldName, orFieldValue) {
            
            var searchName = solrFieldsHelper.getSolrFieldName(orFieldName, collection);
            
            return searchName + ':' + adapter.getSolrFieldFilter(orFieldName, orFieldValue, collection);
          }

          fieldCriteria.forEach(function(field) {
            var allKeys = Object.keys(field);
            var toPush = allKeys.map(function(k, i) {
              return processFilter(k, field[k]);
            })
            if (toPush.length == 1) return fields.push(toPush[0]);
            fields.push( '(' + toPush.join(' AND ') + ')' );
          })

          return '(' + fields.join(' OR ') + ')';
        default:
          sails.log.warn(criteriaType + ' filter criteria is not implemented yet.');
      }
    },

    /**
     *
     * Identifies the kind of Waterline condition being handled.
     * This could be an IN condition, a negated IN condition,
     * contains, startsWith, etcetera. Any kind of filter Waterline allows.
     *
     * The resulting type string should be used for switching the strategy
     * used to turn the Waterline condition into a Solr filter
     * (with the aid of solr-client)
     *
     * @param  {object}  fieldConditions  [fieldConditions]
     * @return {string|false}             [returns a string if the identification is successful
                                          , false if it fails]
     */
    getCriteriaType: function(fieldName, fieldCriteria) {
      var type = typeof(fieldCriteria);

      if(type == 'string' || type == 'number') {
        return 'match value';
      }
      if(fieldName.toLowerCase() == 'or') {
        return 'OR';
      }
      if(fieldCriteria instanceof Array) {
        return 'IN';
      }


      else {
        sails.log.warn('QueryBuilder: Unidentified criteria.', fieldCriteria);
        return null;
      }
    }
  };

  

  return queryBuilder;
})();
