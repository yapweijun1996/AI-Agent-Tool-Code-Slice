<cfcomponent output="false">
	<cffunction name="getInvoice" access="public" returntype="query">
		<cfargument name="invoiceId" type="numeric" required="true">
		<cfquery name="qInvoice" datasource="#application.dsn#">
			SELECT id, total FROM invoices WHERE id = <cfqueryparam value="#arguments.invoiceId#">
		</cfquery>
		<cfscript>
			var total = calculateTotal(qInvoice.total, 1);
			function calculateTotal(qty, price) {
				return qty * price;
			}
		</cfscript>
		<cfreturn qInvoice>
	</cffunction>

	<cffunction name="save" access="public" returntype="boolean">
		<cfreturn true>
	</cffunction>

	<cffunction name="runDynamicQuery" access="private">
		<cfset var qName = "qDynamic">
		<cfquery name="#qName#" datasource="#application.dsn#">
			SELECT 1
		</cfquery>
	</cffunction>
</cfcomponent>
