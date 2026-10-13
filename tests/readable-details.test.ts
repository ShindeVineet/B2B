import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadableDetails } from '../src/components/shared/ReadableDetails';
test('consultation history renders nested objects and JSON audit values as labeled fields',()=>{
 const html=renderToStaticMarkup(React.createElement(ReadableDetails,{value:{responses:{raw:{'Company name':'Example LLP',checklist:['Met owner','Shared catalogue']}},new_value:'{"lat":12.9,"location_verified":true}'}}));
 assert.ok(html.includes('Example LLP'));assert.ok(html.includes('<li>Met owner</li>'));assert.ok(html.includes('Yes'));assert.ok(!html.includes('&quot;lat&quot;'));assert.ok(!html.includes('[object Object]'));assert.ok(!html.includes('{'));
});
test('plain notes remain plain text and are HTML escaped',()=>{
 const html=renderToStaticMarkup(React.createElement(ReadableDetails,{value:{notes:'[Pending] <script>example</script>',whatsapp_group_created:false}}));
 assert.ok(html.includes('[Pending] &lt;script&gt;'));assert.ok(html.includes('No'));
});
