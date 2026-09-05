<cfcomponent output="false">
	<script>
		function renderInvoice(id) {
			return id + 1;
		}
		const invoiceLabel = "invoice";
	</script>

	<style>
		.invoice-card {
			color: blue;
		}

		@media screen {
			#invoice-total {
				display: block;
			}
		}
	</style>

	<cfquery name="qEmbedded" datasource="#application.dsn#">
		SELECT COALESCE(total, 0) AS total
		FROM invoices
		WHERE id = <cfqueryparam value="#arguments.invoiceId#" cfsqltype="cf_sql_integer">
		ORDER BY created_at DESC
	</cfquery>
</cfcomponent>
